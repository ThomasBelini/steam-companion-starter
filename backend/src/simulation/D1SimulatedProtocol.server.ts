import type { D1Database } from '@cloudflare/workers-types';
import { authHash } from '../auth/D1OpenIdPreparation.server';
import { canonicalSecret, challengeHex, isSubject, randomSimulationSecret, SimulatedIdentityProvider,
  type SimulatedEnvelope, type SimulatedSubject } from './SimulatedIdentityProvider.server';

if ('window' in globalThis) throw new Error('Protocolo simulado exclusivo do servidor.');

type BrowserContext = Readonly<{ state: string; browserBinding: string; csrf: string }>;
type NativeContext = Readonly<{ state: string; verifier: string }>;
type Failure = { ok: false; error: 'rejected' | 'storage-unavailable' };
type Result<T> = ({ ok: true } & T) | Failure;
const rejected: Failure = { ok: false, error: 'rejected' };
const unavailable: Failure = { ok: false, error: 'storage-unavailable' };
const validBrowser = (input: BrowserContext) => input && [input.state, input.browserBinding, input.csrf].every(canonicalSecret);
const validNative = (input: NativeContext) => input && [input.state, input.verifier].every(canonicalSecret);

// Exclusivamente chamadas internas de laboratório; não importar no entrypoint HTTP.
// Não conhece tabelas users/sessions, não emite autorização ou identidade Steam.
export class D1SimulatedProtocol {
  constructor(readonly db: D1Database, readonly provider: SimulatedIdentityProvider) {}

  async begin(s256Challenge: string): Promise<Result<{ browser: BrowserContext; stage: 'simulation-started' }>> {
    const challenge = challengeHex(s256Challenge);
    if (!challenge) return rejected;
    const browser = { state: randomSimulationSecret(), browserBinding: randomSimulationSecret(), csrf: randomSimulationSecret() };
    try {
      const hash = await authHash(browser.state);
      const row = await this.db.prepare(`INSERT INTO simulation_attempts
        (state_hash, challenge_hash, browser_hash, csrf_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, unixepoch(), unixepoch() + 300) RETURNING state_hash`)
        .bind(hash, challenge, await authHash(browser.browserBinding), await authHash(browser.csrf)).first<{ state_hash: string }>();
      // browserBinding/CSRF são credenciais internas do mock. Entrega HTTPS/cookie NÃO implementada.
      return row?.state_hash === hash ? { ok: true, browser, stage: 'simulation-started' } : unavailable;
    } catch { return unavailable; }
  }

  async recordIdentity(input: BrowserContext, envelope: SimulatedEnvelope): Promise<Result<{ stage: 'simulated-identity-recorded' }>> {
    if (!validBrowser(input)) return rejected;
    try {
      const evidence = await this.provider.verify(envelope);
      const stateHash = await authHash(input.state), browserHash = await authHash(input.browserBinding), csrfHash = await authHash(input.csrf);
      if (!evidence || evidence.attemptHash !== stateHash || evidence.browserHash !== browserHash || evidence.csrfHash !== csrfHash) return rejected;
      const row = await this.db.prepare(`INSERT INTO simulation_assertions (attempt_hash, issuer, subject, nonce_hash, verified_at, issued_at)
        SELECT state_hash, ?, ?, ?, unixepoch(), ? FROM simulation_attempts
        WHERE state_hash = ? AND browser_hash = ? AND csrf_hash = ? RETURNING attempt_hash`)
        .bind(evidence.issuer, evidence.subject, await authHash(evidence.nonce), evidence.issuedAt, stateHash, browserHash, csrfHash)
        .first<{ attempt_hash: string }>();
      return row?.attempt_hash === stateHash ? { ok: true, stage: 'simulated-identity-recorded' } : rejected;
    } catch { return unavailable; }
  }

  async approveIdentity(input: NativeContext, expectedSubject: SimulatedSubject): Promise<Result<{ stage: 'simulated-native-approval' }>> {
    if (!validNative(input) || !isSubject(expectedSubject)) return rejected;
    try {
      const row = await this.db.prepare(`UPDATE simulation_attempts SET approved_subject = ?, approved_at = unixepoch()
        WHERE state_hash = ? AND challenge_hash = ? AND approved_at IS NULL AND cancelled_at IS NULL AND finalized_at IS NULL
          AND expires_at > unixepoch() AND EXISTS (SELECT 1 FROM simulation_assertions v WHERE v.attempt_hash = state_hash AND v.subject = ?)
        RETURNING state_hash`)
        .bind(expectedSubject, await authHash(input.state), await authHash(input.verifier), expectedSubject).first();
      return row ? { ok: true, stage: 'simulated-native-approval' } : rejected;
    } catch { return unavailable; }
  }

  async prepareCode(input: BrowserContext): Promise<Result<{ code: string; stage: 'simulated-code-prepared' }>> {
    if (!validBrowser(input)) return rejected;
    try {
      const code = randomSimulationSecret();
      const row = await this.db.prepare(`INSERT INTO simulation_grants (code_hash, attempt_hash, created_at, expires_at)
        SELECT ?, state_hash, unixepoch(), min(unixepoch() + 60, expires_at) FROM simulation_attempts
        WHERE state_hash = ? AND browser_hash = ? AND csrf_hash = ? AND cancelled_at IS NULL AND finalized_at IS NULL
          AND expires_at > unixepoch() AND approved_at IS NOT NULL RETURNING code_hash`)
        .bind(await authHash(code), await authHash(input.state), await authHash(input.browserBinding), await authHash(input.csrf)).first();
      return row ? { ok: true, code, stage: 'simulated-code-prepared' } : rejected;
    } catch { return unavailable; }
  }

  async redeem(input: NativeContext & { code: string; expectedSubject: SimulatedSubject }): Promise<Result<{ stage: 'simulation-completed-no-session'; subject: SimulatedSubject }>> {
    if (!validNative(input) || !canonicalSecret(input.code) || !isSubject(input.expectedSubject)) return rejected;
    const { state, verifier, code, expectedSubject } = input;
    try {
      // Prova, dono, prazos e consumo na própria escrita; pré-leitura nunca concede resgate.
      const row = await this.db.prepare(`UPDATE simulation_grants SET consumed_at = unixepoch()
        WHERE code_hash = ? AND attempt_hash = ? AND consumed_at IS NULL AND expires_at > unixepoch()
          AND EXISTS (SELECT 1 FROM simulation_attempts a JOIN simulation_assertions v ON v.attempt_hash = a.state_hash
            WHERE a.state_hash = simulation_grants.attempt_hash AND a.challenge_hash = ? AND a.approved_subject = ?
              AND v.subject = a.approved_subject AND a.cancelled_at IS NULL AND a.finalized_at IS NULL AND a.expires_at > unixepoch())
        RETURNING code_hash`)
        .bind(await authHash(code), await authHash(state), await authHash(verifier), expectedSubject).first();
      return row ? { ok: true, stage: 'simulation-completed-no-session', subject: expectedSubject } : rejected;
    } catch { return unavailable; }
  }

  async cancel(input: NativeContext): Promise<Result<{ stage: 'simulation-cancelled' }>> {
    if (!validNative(input)) return rejected;
    try {
      const row = await this.db.prepare(`UPDATE simulation_attempts SET cancelled_at = unixepoch()
        WHERE state_hash = ? AND challenge_hash = ? AND cancelled_at IS NULL AND finalized_at IS NULL AND expires_at > unixepoch()
        RETURNING state_hash`).bind(await authHash(input.state), await authHash(input.verifier)).first();
      return row ? { ok: true, stage: 'simulation-cancelled' } : rejected;
    } catch { return unavailable; }
  }
}
