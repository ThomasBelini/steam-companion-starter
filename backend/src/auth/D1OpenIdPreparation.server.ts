import { SteamOpenIdVerifier } from '../../steam/SteamOpenIdVerifier.server';
import type { D1Database } from '@cloudflare/workers-types';
import type { OpenIdDependencies, OpenIdFailureCode } from '../../steam/OpenIdContracts';

if ('window' in globalThis) throw new Error('A preparação OpenID só pode ser usada no servidor.');

const hashFormat = /^[0-9a-f]{64}$/;
const secretFormat = /^[A-Za-z0-9_-]{43}$/; // Contrato local: 32 bytes aleatórios, base64url sem padding.
export async function authHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

type Context = { expected_return_to: string; realm: string; return_channel: 'web' | 'desktop'; challenge_hash: string };
export type PreparationResult =
  | { ok: true; stage: 'assertion-recorded-no-session' }
  | { ok: false; error: OpenIdFailureCode | 'invalid-attempt' | 'storage-failed' };

// Sem fetch/discovery padrão; sem método para receber sucesso serializado pelo cliente.
export class D1OpenIdPreparation {
  readonly #verifier: SteamOpenIdVerifier;
  constructor(readonly db: D1Database, dependencies: Omit<OpenIdDependencies, 'lookupNonce'>) {
    this.#verifier = new SteamOpenIdVerifier({ ...dependencies, lookupNonce: async (hash, signal) => {
      if (signal.aborted || !hashFormat.test(hash)) throw new Error('Invalid nonce lookup');
      // Mesmo uma linha vencida significa visto. Limpeza nunca autoriza um nonce ainda recente.
      const row = await db.prepare('SELECT nonce_hash FROM openid_nonces WHERE nonce_hash = ?').bind(hash).first<{ nonce_hash: string }>();
      if (signal.aborted) throw new Error('Nonce lookup aborted');
      if (row === null) return 'unseen';
      if (row?.nonce_hash === hash) return 'seen';
      throw new Error('Invalid nonce lookup result');
    } });
  }

  async verifyAndRecord(input: { state: string; browserBinding: string; method: 'GET'; callbackUrl: string }): Promise<PreparationResult> {
    if (!input || !secretFormat.test(input.state) || !secretFormat.test(input.browserBinding)) return { ok: false, error: 'invalid-attempt' };
    try {
      const stateHash = await authHash(input.state);
      const bindingHash = await authHash(input.browserBinding);
      const context = await this.db.prepare(`SELECT c.expected_return_to, c.realm, a.return_channel, a.challenge_hash
        FROM auth_attempts a JOIN auth_attempt_contexts c ON c.attempt_hash = a.state_hash
        WHERE a.state_hash = ? AND c.browser_binding_hash = ? AND a.integrity_version = 1
          AND a.consumed_at IS NULL AND a.created_at <= unixepoch() AND a.expires_at > unixepoch()
          AND NOT EXISTS (SELECT 1 FROM verified_openid_assertions v WHERE v.attempt_hash = a.state_hash)`)
        .bind(stateHash, bindingHash).first<Context>();
      if (!context) return { ok: false, error: 'invalid-attempt' };
      const states = new URL(context.expected_return_to).searchParams.getAll('state');
      if (states.length !== 1 || states[0] !== input.state) return { ok: false, error: 'invalid-attempt' };
      const verified = await this.#verifier.verify({ method: input.method, callbackUrl: input.callbackUrl,
        expectedReturnTo: context.expected_return_to, realm: context.realm });
      if (!verified.ok) return verified;
      const assertion = verified.assertion;
      // Não usar UPDATE condicional seguido de INSERT: zero linhas não é erro em batch.
      // Revalidar contexto/posse na própria instrução; trigger revalida prazos e unicidade.
      const result = await this.db.prepare(`INSERT INTO verified_openid_assertions
        (attempt_hash, nonce_hash, steam_id, claimed_id, op_endpoint, return_channel, challenge_hash, verified_at, nonce_issued_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, unixepoch(), ? FROM auth_attempt_contexts c
        WHERE c.attempt_hash = ? AND c.browser_binding_hash = ? AND c.expected_return_to = ? AND c.realm = ?
        RETURNING attempt_hash`)
        .bind(stateHash, assertion.nonceHash, assertion.steamId, assertion.claimedId, assertion.opEndpoint,
          context.return_channel, context.challenge_hash, assertion.nonceIssuedAt, stateHash, bindingHash, assertion.returnTo, context.realm).first<{ attempt_hash: string }>();
      if (result?.attempt_hash !== stateHash) return { ok: false, error: 'storage-failed' };
      return { ok: true, stage: 'assertion-recorded-no-session' };
    } catch { return { ok: false, error: 'storage-failed' }; }
  }
}
