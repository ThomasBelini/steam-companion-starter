// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SteamWebApi } from '../backend/steam/SteamWebApi.server';
import { ownedBody, playerBody, schemaBody, steamId } from './fixtures/steam';

// Não é uma chave real nem tem o formato de uma chave Steam.
const testKey = 'test-only-placeholder';
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.useRealTimers());

describe('transporte Steam exclusivo do servidor', () => {
  it('envia GetOwnedGames ao host público HTTPS com chave no header, fora da URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(ownedBody));
    const api = new SteamWebApi({ apiKey: testKey, fetcher });
    expect((await api.getOwnedGames(steamId)).ok).toBe(true);
    const [input, init] = fetcher.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin).toBe('https://api.steampowered.com');
    expect(url.pathname).toBe('/IPlayerService/GetOwnedGames/v1/');
    expect(JSON.parse(url.searchParams.get('input_json')!)).toEqual({ steamid: steamId, include_appinfo: true, include_played_free_games: true });
    expect(url.toString()).not.toContain(testKey);
    expect(url.searchParams.has('key')).toBe(false);
    expect(init).toMatchObject({ method: 'GET', headers: { 'x-webapi-key': testKey }, redirect: 'error', cache: 'no-store' });
    expect(new Headers(init?.headers).has('cookie')).toBe(false);
  });

  it('usa GetPlayerAchievements v1 e GetSchemaForGame v2 com AppID e idioma', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(playerBody)).mockResolvedValueOnce(response(schemaBody));
    const api = new SteamWebApi({ apiKey: testKey, fetcher, language: 'english' });
    expect((await api.getPlayerAchievements(steamId, 101)).ok).toBe(true);
    expect((await api.getSchemaForGame(101)).ok).toBe(true);
    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls[0].pathname).toBe('/ISteamUserStats/GetPlayerAchievements/v1/');
    expect(urls[0].searchParams.get('steamid')).toBe(steamId);
    expect(urls[1].pathname).toBe('/ISteamUserStats/GetSchemaForGame/v2/');
    expect(urls[1].searchParams.has('steamid')).toBe(false);
    urls.forEach(url => {
      expect(url.searchParams.get('appid')).toBe('101');
      expect(url.searchParams.get('l')).toBe('english');
    });
  });

  it('sem configuração não consulta rede nem pede credenciais', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await new SteamWebApi({ fetcher }).getOwnedGames(steamId)).toMatchObject({ ok: false, error: { code: 'not-configured' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['123', 'abc', '18446744073709551616', '1e17'])('rejeita SteamID inválido %s antes de consultar', async id => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await new SteamWebApi({ apiKey: testKey, fetcher }).getOwnedGames(id)).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, 4294967296])('rejeita AppID inválido %s', async appid => {
    const fetcher = vi.fn<typeof fetch>();
    const api = new SteamWebApi({ apiKey: testKey, fetcher });
    expect((await api.getSchemaForGame(appid)).ok).toBe(false);
    expect((await api.getPlayerAchievements(steamId, appid)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([[401, 'access-denied'], [403, 'access-denied'], [429, 'rate-limited'], [500, 'unavailable'], [503, 'unavailable']] as const)('classifica HTTP %s sem repetir consulta ou vazar corpo', async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(testKey, { status, headers: { 'retry-after': '60' } }));
    const result = await new SteamWebApi({ apiKey: testKey, fetcher }).getOwnedGames(steamId);
    expect(result).toMatchObject({ ok: false, error: { code } });
    if (status === 429) expect(result).toMatchObject({ error: { retryAfterSeconds: 60 } });
    expect(JSON.stringify(result)).not.toContain(testKey);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejeita JSON inválido sem expor a resposta', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>upstream error</html>'));
    expect(await new SteamWebApi({ apiKey: testKey, fetcher }).getOwnedGames(steamId)).toMatchObject({ ok: false, error: { code: 'invalid-response' } });
  });

  it('converte falha de rede em mensagem sanitizada', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(`upstream ${testKey}`));
    const result = await new SteamWebApi({ apiKey: testKey, fetcher }).getOwnedGames(steamId);
    expect(result).toMatchObject({ ok: false, error: { code: 'unavailable' } });
    expect(JSON.stringify(result)).not.toContain(testKey);
  });

  it.each(['invalid', '-1', '1000000000000'])('ignora Retry-After inválido %s', async retry => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': retry } }));
    const result = await new SteamWebApi({ apiKey: testKey, fetcher }).getOwnedGames(steamId);
    expect(result).toMatchObject({ ok: false, error: { code: 'rate-limited' } });
    if (!result.ok) expect(result.error.retryAfterSeconds).toBeUndefined();
  });

  it('aplica timeout também durante a leitura do corpo', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const pendingBody = new Response(null);
      vi.spyOn(pendingBody, 'json').mockImplementation(() => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));
      return pendingBody;
    });
    const pending = new SteamWebApi({ apiKey: testKey, fetcher, timeoutMs: 10 }).getOwnedGames(steamId);
    await vi.advanceTimersByTimeAsync(11);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'timeout' } });
  });

  it('encerra consulta por timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const pending = new SteamWebApi({ apiKey: testKey, fetcher, timeoutMs: 10 }).getOwnedGames(steamId);
    await vi.advanceTimersByTimeAsync(11);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'timeout' } });
  });

  it('respeita cancelamento antes de iniciar e durante a consulta', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const api = new SteamWebApi({ apiKey: testKey, fetcher });
    const controller = new AbortController();
    const pending = api.getOwnedGames(steamId, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(await api.getOwnedGames(steamId, controller.signal)).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
