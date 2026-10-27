import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPlatformProxy, unstable_splitSqlQuery, type PlatformProxy } from 'wrangler';
import app from '../src/index';
import type { Bindings } from '../src/bindings';

let proxy: PlatformProxy<Bindings>;
const userA = '10000000000000000';
const userB = '10000000000000001';
let now: number;
const token = 'a'.repeat(64);
const csrf = 'b'.repeat(64);
const state = 'c'.repeat(64);
const challenge = 'd'.repeat(64);
const grant = 'e'.repeat(64);
const nonce = 'f'.repeat(64);

beforeAll(async () => {
  // Configuração isolada: não carrega .dev.vars do backend nem usa sua persistência local.
  proxy = await getPlatformProxy<Bindings>({
    configPath: 'backend/tests/wrangler.test.json', persist: false, remoteBindings: false, envFiles: [],
  });
  for (const file of readdirSync('backend/migrations').filter(file => file.endsWith('.sql')).sort()) {
    const statements = unstable_splitSqlQuery(readFileSync(`backend/migrations/${file}`, 'utf8'));
    await proxy.env.DB.batch(statements.map(sql => proxy.env.DB.prepare(sql)));
    if (file === '0001_initial.sql') {
      // As migrações seguintes devem preservar usuários válidos do esquema original.
      await proxy.env.DB.batch([
        proxy.env.DB.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(userA),
        proxy.env.DB.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(userB),
      ]);
    }
  }
  now = (await proxy.env.DB.prepare('SELECT unixepoch() AS now').first<{ now: number }>())!.now;
});
afterAll(async () => { await proxy?.dispose(); });

describe('rotas do backend local', () => {
  it('health consulta D1 sem expor schema, versão, configuração ou segredos', async () => {
    const env = { ...proxy.env, STEAM_API_KEY: 'test-only-placeholder' };
    const response = await app.request('/health', {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it('HEAD health não contém corpo', async () => {
    const response = await app.request('/health', { method: 'HEAD' }, proxy.env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('health sem binding responde 503 sem detalhes internos', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('falha de D1 não vaza a exceção nem gera log com valores sensíveis', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unavailableDb = { prepare: () => { throw new Error('test-only-private-error'); } } as unknown as Bindings['DB'];
    const response = await app.request('/health', {}, { DB: unavailableDb });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
    expect(log).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('health rejeita método %s', async method => {
    const response = await app.request('/health', { method }, proxy.env);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });

  it.each(['/auth', '/auth/login', '/auth/callback', '/auth/logout', '/auth/desktop/redeem'])('login permanece desativado em %s', async path => {
    const response = await app.request(path, { method: 'POST', headers: { Authorization: 'Bearer test-only-placeholder' } }, proxy.env);
    expect(response.status).toBe(501);
    expect(await response.json()).toEqual({ error: { code: 'authentication_not_implemented' } });
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Location')).toBe(false);
  });

  it.each<Record<string, string>>([
    {}, { Authorization: 'Bearer test-only-placeholder' }, { Cookie: 'session=test-only-placeholder' },
    { 'X-User-Id': userA }, { 'X-Authenticated-User': userB, 'X-Dev-Auth': 'true' },
  ])('não aceita identidade fornecida por headers: %j', async headers => {
    const response = await app.request(`/api/library?steam_id=${userA}`, { headers }, proxy.env);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'authentication_required' } });
  });

  it('requisição cross-origin não recebe CORS ou acesso a dados', async () => {
    const response = await app.request('/api/wishlist', {
      method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ steam_id: userA, app_id: 101 }),
    }, proxy.env);
    expect(response.status).toBe(401);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect((await proxy.env.DB.prepare('SELECT count(*) AS count FROM user_wishlist').first<{ count: number }>())?.count).toBe(0);
  });

  it('desconhecidos e preflight permanecem fechados, sem eco de dados', async () => {
    for (const path of ['/admin?token=test-only-placeholder', '/debug', '/env']) {
      const response = await app.request(path, {}, proxy.env);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: 'not_found' } });
    }
    const preflight = await app.request('/api/library', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.invalid' } }, proxy.env);
    expect(preflight.status).toBe(401);
    expect(preflight.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});

describe('migrações versionadas no D1 emulado', () => {
  it('cria as tabelas reais e simuladas separadas, mantém privacidade padrão e ativa chaves estrangeiras', async () => {
    const tables = await proxy.env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all<{ name: string }>();
    expect(tables.results.map(row => row.name)).toEqual([
      'auth_attempt_contexts', 'auth_attempts', 'desktop_grants', 'openid_nonces', 'session_origins', 'sessions',
      'simulation_assertions', 'simulation_attempts', 'simulation_grants', 'user_goals', 'user_settings', 'user_wishlist', 'users', 'verified_openid_assertions',
    ]);
    expect((await proxy.env.DB.prepare('SELECT profile_visibility FROM users WHERE steam_id = ?').bind(userA).first<{ profile_visibility: string }>())?.profile_visibility).toBe('private');
    expect((await proxy.env.DB.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>())?.foreign_keys).toBe(1);
  });

  it.each(['invalid', '01234567890123456', '18446744073709551616', '1000000000000000x'])('rejeita SteamID64 inválido %s', async steamId => {
    await expect(proxy.env.DB.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(steamId).run()).rejects.toThrow();
  });

  it.each(['[]', 'true', 'null', '{broken', JSON.stringify({ large: 'a'.repeat(16384) })])('rejeita preferências que não são objeto limitado: %s', async settings => {
    await expect(proxy.env.DB.prepare('INSERT INTO user_settings (steam_id, settings_json) VALUES (?, ?)').bind(userA, settings).run()).rejects.toThrow();
  });

  it.each([0, -1, 1.5, 4294967296])('rejeita AppID inválido em desejos e metas: %s', async appid => {
    for (const table of ['user_wishlist', 'user_goals']) {
      await expect(proxy.env.DB.prepare(`INSERT INTO ${table} (steam_id, app_id) VALUES (?, ?)`).bind(userA, appid).run()).rejects.toThrow();
    }
  });

  it('valida também atualizações de preferências, AppID e SteamID', async () => {
    await proxy.env.DB.prepare('INSERT INTO user_settings (steam_id) VALUES (?)').bind(userA).run();
    await expect(proxy.env.DB.prepare('UPDATE user_settings SET settings_json = ? WHERE steam_id = ?').bind('[]', userA).run()).rejects.toThrow();
    await proxy.env.DB.prepare('INSERT INTO user_goals (steam_id, app_id) VALUES (?, ?)').bind(userA, 101).run();
    await expect(proxy.env.DB.prepare('UPDATE user_goals SET app_id = 0 WHERE steam_id = ?').bind(userA).run()).rejects.toThrow();
    await expect(proxy.env.DB.prepare('UPDATE users SET steam_id = ? WHERE steam_id = ?').bind('invalid', userB).run()).rejects.toThrow();
    await expect(proxy.env.DB.prepare('UPDATE users SET steam_id = NULL WHERE steam_id = ?').bind(userB).run()).rejects.toThrow();
    await expect(proxy.env.DB.prepare('UPDATE user_settings SET steam_id = NULL WHERE steam_id = ?').bind(userA).run()).rejects.toThrow();
  });

  it('rejeita identidade nula e JSON que ultrapassa o limite em bytes UTF-8', async () => {
    await expect(proxy.env.DB.prepare('INSERT INTO users (steam_id) VALUES (NULL)').run()).rejects.toThrow();
    await expect(proxy.env.DB.prepare('INSERT INTO user_settings (steam_id) VALUES (NULL)').run()).rejects.toThrow();
    await expect(proxy.env.DB.prepare('UPDATE user_settings SET settings_json = ? WHERE steam_id = ?').bind(JSON.stringify({ large: 'é'.repeat(9000) }), userA).run()).rejects.toThrow();
  });

  it('não permite filho sem usuário ou desejo duplicado', async () => {
    await expect(proxy.env.DB.prepare('INSERT INTO user_wishlist (steam_id, app_id) VALUES (?, ?)').bind('10000000000000009', 101).run()).rejects.toThrow();
    await proxy.env.DB.prepare('INSERT INTO user_wishlist (steam_id, app_id) VALUES (?, ?)').bind(userA, 101).run();
    await expect(proxy.env.DB.prepare('INSERT INTO user_wishlist (steam_id, app_id) VALUES (?, ?)').bind(userA, 101).run()).rejects.toThrow();
    await proxy.env.DB.prepare('INSERT INTO user_wishlist (steam_id, app_id) VALUES (?, ?)').bind(userB, 101).run();
    expect((await proxy.env.DB.prepare('SELECT count(*) AS count FROM user_wishlist WHERE steam_id = ?').bind(userA).first<{ count: number }>())?.count).toBe(1);
  });

  it('sessões preparatórias exigem hash, vínculo, prazo curto e CSRF para web', async () => {
    const attempt = '1'.repeat(64);
    await proxy.env.DB.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(attempt, challenge, 'web', now, now + 300).run();
    const sql = 'INSERT INTO sessions (token_hash, steam_id, client_kind, csrf_token_hash, created_at, expires_at, last_seen_at, source_attempt_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    await expect(proxy.env.DB.prepare(sql).bind('raw-token', userA, 'web', csrf, now, now + 60, now, attempt).run()).rejects.toThrow();
    await expect(proxy.env.DB.prepare(sql).bind(token, userA, 'web', null, now, now + 60, now, attempt).run()).rejects.toThrow();
    await expect(proxy.env.DB.prepare(sql).bind(token, userA, 'web', csrf, now, now + 3601, now, attempt).run()).rejects.toThrow();
    await proxy.env.DB.prepare(sql).bind(token, userA, 'web', csrf, now, now + 3600, now, attempt).run();
    const select = 'SELECT steam_id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? AND last_seen_at > ?';
    expect(await proxy.env.DB.prepare(select).bind(token, now + 1, now + 1 - 900).first()).toMatchObject({ steam_id: userA });
    expect(await proxy.env.DB.prepare(select).bind(token, now + 3600, now).first()).toBeNull();
    expect(await proxy.env.DB.prepare(select).bind(token, now + 901, now + 1).first()).toBeNull();
    await proxy.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(now, token).run();
    expect(await proxy.env.DB.prepare(select).bind(token, now + 3, now - 897).first()).toBeNull();
    // A existência de linha no banco não habilita autenticação no HTTP.
    expect((await app.request('/api/library', { headers: { Authorization: `Bearer ${token}` } }, proxy.env)).status).toBe(401);
  });

  it('nonces únicos e consumo condicional de grants suportam rejeição de replay', async () => {
    await proxy.env.DB.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(state, challenge, 'desktop', now, now + 300).run();
    await proxy.env.DB.prepare('INSERT INTO openid_nonces (nonce_hash, created_at, expires_at) VALUES (?, ?, ?)').bind(nonce, now, now + 600).run();
    await expect(proxy.env.DB.prepare('INSERT INTO openid_nonces (nonce_hash, created_at, expires_at) VALUES (?, ?, ?)').bind(nonce, now, now + 600).run()).rejects.toThrow();
    await proxy.env.DB.prepare('INSERT INTO desktop_grants (code_hash, attempt_hash, steam_id, challenge_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(grant, state, userA, challenge, now, now + 60).run();
    const consume = 'UPDATE desktop_grants SET consumed_at = ? WHERE code_hash = ? AND challenge_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING steam_id';
    expect(await proxy.env.DB.prepare(consume).bind(now + 1, grant, '0'.repeat(64), now + 1).first()).toBeNull();
    expect(await proxy.env.DB.prepare(consume).bind(now + 60, grant, challenge, now + 60).first()).toBeNull();
    const results = await proxy.env.DB.batch([
      proxy.env.DB.prepare(consume).bind(now, grant, challenge, now),
      proxy.env.DB.prepare(consume).bind(now, grant, challenge, now),
    ]);
    expect(results.map(result => result.results.length)).toEqual([1, 0]);
  });

  it('apagar um usuário revoga seus dados por cascata sem apagar os do outro', async () => {
    await proxy.env.DB.prepare('DELETE FROM users WHERE steam_id = ?').bind(userA).run();
    for (const table of ['sessions', 'session_origins', 'desktop_grants', 'user_settings', 'user_goals', 'user_wishlist']) {
      expect((await proxy.env.DB.prepare(`SELECT count(*) AS count FROM ${table} WHERE steam_id = ?`).bind(userA).first<{ count: number }>())?.count).toBe(0);
    }
    expect((await proxy.env.DB.prepare('SELECT count(*) AS count FROM user_wishlist WHERE steam_id = ?').bind(userB).first<{ count: number }>())?.count).toBe(1);
  });
});
