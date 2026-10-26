import { failure, type Result } from '../../src/library/contracts';
import { validAppId, validSteamId, type SteamApi } from '../../src/steam/contracts';
import { normalizeOwnedGames, normalizePlayerAchievements, normalizeSchema } from '../../src/steam/normalize';

if ('window' in globalThis) throw new Error('O cliente Steam só pode ser usado no servidor.');

type Options = { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number; language?: 'brazilian' | 'english' };

// Sem rota, login, leitura de .env ou configuração real. Nunca importar em src/.
export class SteamWebApi implements SteamApi {
  #options: Options;
  constructor(options: Options = {}) {
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
      throw new Error('Prazo de consulta inválido.');
    }
    this.#options = { ...options };
  }

  getOwnedGames(steamId: string, signal?: AbortSignal) {
    if (!validSteamId(steamId)) return Promise.resolve(failure('invalid-input'));
    return this.request('IPlayerService/GetOwnedGames/v1/', {
      input_json: JSON.stringify({ steamid: steamId, include_appinfo: true, include_played_free_games: true }),
    }, normalizeOwnedGames, signal);
  }

  getPlayerAchievements(steamId: string, appid: number, signal?: AbortSignal) {
    if (!validSteamId(steamId) || !validAppId(appid)) return Promise.resolve(failure('invalid-input'));
    return this.request('ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: steamId, appid: String(appid), l: this.#options.language ?? 'brazilian',
    }, body => normalizePlayerAchievements(body, steamId), signal);
  }

  getSchemaForGame(appid: number, signal?: AbortSignal) {
    if (!validAppId(appid)) return Promise.resolve(failure('invalid-input'));
    return this.request('ISteamUserStats/GetSchemaForGame/v2/', {
      appid: String(appid), l: this.#options.language ?? 'brazilian',
    }, normalizeSchema, signal);
  }

  private async request<T>(path: string, params: Record<string, string>, parse: (body: unknown) => Result<T>, signal?: AbortSignal): Promise<Result<T>> {
    if (signal?.aborted) return failure('cancelled');
    if (!this.#options.apiKey?.trim()) return failure('not-configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#options.timeoutMs ?? 8000);
    try {
      const url = new URL(path, 'https://api.steampowered.com/');
      url.search = new URLSearchParams({ format: 'json', ...params }).toString();
      const response = await (this.#options.fetcher ?? fetch)(url, {
        method: 'GET', headers: { 'x-webapi-key': this.#options.apiKey },
        credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
      if (signal?.aborted || controller.signal.aborted) return failure(signal?.aborted ? 'cancelled' : 'timeout');
      if (response.status === 401 || response.status === 403) return failure('access-denied');
      if (response.status === 429) {
        const result = failure('rate-limited');
        const retry = response.headers.get('retry-after');
        if (retry && /^\d+$/.test(retry) && Number(retry) <= 86400) result.error.retryAfterSeconds = Number(retry);
        return result;
      }
      if (!response.ok) return failure('unavailable');
      try {
        const body: unknown = await response.json();
        if (signal?.aborted || controller.signal.aborted) return failure(signal?.aborted ? 'cancelled' : 'timeout');
        return parse(body);
      }
      catch {
        if (controller.signal.aborted || signal?.aborted) return failure(signal?.aborted ? 'cancelled' : 'timeout');
        return failure('invalid-response');
      }
    } catch {
      return failure(signal?.aborted ? 'cancelled' : controller.signal.aborted ? 'timeout' : 'unavailable');
    } finally { clearTimeout(timer); }
  }
}
