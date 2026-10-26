import { OPENID_NAMESPACE, STEAM_OPENID_ENDPOINT, type OpenIdCallback, type OpenIdDependencies, type OpenIdVerificationResult } from './OpenIdContracts';
import { boundedResponse, OpenIdFailure, requireValid, validateCallback, validateNonce, validateProviderResponse } from './OpenIdValidation.server';

if ('window' in globalThis) throw new Error('O verificador OpenID só pode ser usado no servidor.');

export class SteamOpenIdVerifier {
  readonly #options: OpenIdDependencies;

  constructor(options: OpenIdDependencies) {
    if (!options || typeof options.fetcher !== 'function' || typeof options.discoverIdentity !== 'function'
      || typeof options.lookupNonce !== 'function' || (options.now !== undefined && typeof options.now !== 'function')
      || (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 8000))) {
      throw new Error('Configuração OpenID inválida.');
    }
    this.#options = { ...options };
  }

  async verify(input: OpenIdCallback): Promise<OpenIdVerificationResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<OpenIdVerificationResult>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, error: 'timeout' });
      }, this.#options.timeoutMs ?? 8000);
    });
    try {
      return await Promise.race([this.#verify(input, controller.signal).catch((error: unknown): OpenIdVerificationResult => ({
        ok: false, error: error instanceof OpenIdFailure ? error.code : 'unavailable',
      })), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  }

  async #verify(input: OpenIdCallback, signal: AbortSignal): Promise<OpenIdVerificationResult> {
    const now = this.#options.now ?? Date.now;
    const parsed = validateCallback(input, now());
    const nonceBytes = new TextEncoder().encode(`${STEAM_OPENID_ENDPOINT}\n${parsed.nonce}`);
    const digest = await crypto.subtle.digest('SHA-256', nonceBytes);
    const nonceHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    requireValid(!signal.aborted, 'timeout');
    const replay = await this.#options.lookupNonce(nonceHash, signal);
    requireValid(!signal.aborted, 'timeout');
    requireValid(replay === 'unseen', replay === 'seen' ? 'replay' : 'replay-check-failed');
    const discovered = await this.#options.discoverIdentity(parsed.claimedId, signal);
    requireValid(!signal.aborted, 'timeout');
    requireValid(discovered && discovered.claimedId === parsed.claimedId && discovered.identity === parsed.claimedId
      && discovered.opEndpoint === STEAM_OPENID_ENDPOINT && discovered.namespace === OPENID_NAMESPACE, 'discovery-failed');

    const body = new URLSearchParams();
    for (const [key, value] of parsed.fields) if (key.startsWith('openid.')) body.set(key, value);
    body.set('openid.mode', 'check_authentication');
    const response = await this.#options.fetcher(STEAM_OPENID_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/plain' },
      body: body.toString(), redirect: 'error', cache: 'no-store', signal,
    });
    try {
      requireValid(!signal.aborted, 'timeout');
      validateProviderResponse(await boundedResponse(response, signal));
    } finally {
      if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
    const completedAt = now();
    validateNonce(parsed.nonce, completedAt);
    requireValid(!signal.aborted, 'timeout');
    // Consulta de replay é somente leitura. Nenhuma sessão/grant/token é criado aqui.
    return { ok: true, stage: 'assertion-verified-pending-atomic-commit', assertion: {
      steamId: parsed.steamId, claimedId: parsed.claimedId, opEndpoint: STEAM_OPENID_ENDPOINT,
      returnTo: parsed.returnTo, nonceHash, nonceIssuedAt: parsed.nonceIssuedAt,
      retainNonceUntil: Math.floor(completedAt / 1000) + 600,
    } };
  }
}
