import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { database, migrationStatements } from './d1';
import { authHash, D1OpenIdPreparation } from '../src/auth/D1OpenIdPreparation.server';
import { inspectSessionProvenance } from '../src/auth/D1SessionProvenance.server';
import { OPENID_NAMESPACE, STEAM_OPENID_ENDPOINT, type OpenIdDependencies } from '../steam/OpenIdContracts';
import app from '../src/index';

const alice = '10000000000000000', bob = '20000000000000000';
const binding = 'b'.repeat(43), challenge = 'c'.repeat(64), token = 'd'.repeat(64);
const hash = (value: number) => value.toString(16).padStart(64, '0');
let proxy: Awaited<ReturnType<typeof database>>;
let db: D1Database;
let now: number;
const clock = async () => (await db.prepare('SELECT unixepoch() AS now').first<{ now: number }>())!.now;
const count = async (table: string) => (await db.prepare(`SELECT count(*) AS count FROM ${table}`).first<{ count: number }>())!.count;

async function attempt(id = 1, channel = 'desktop', expires = now + 300) {
  const state = String(id).padStart(43, 'a');
  const stateHash = await authHash(state);
  const expectedReturnTo = `https://companion.example/auth/callback?state=${state}`;
  await db.prepare(`INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`).bind(stateHash, challenge, channel, now, expires).run();
  await db.prepare(`INSERT INTO auth_attempt_contexts (attempt_hash, browser_binding_hash, expected_return_to, realm)
    VALUES (?, ?, ?, ?)`).bind(stateHash, await authHash(binding), expectedReturnTo, 'https://companion.example/').run();
  const fields = new URLSearchParams({
    'openid.ns': OPENID_NAMESPACE, 'openid.mode': 'id_res', 'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${alice}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${alice}`, 'openid.return_to': expectedReturnTo,
    'openid.response_nonce': new Date(now * 1000).toISOString().replace('.000Z', 'Z') + 'synthetic-only',
    'openid.assoc_handle': 'synthetic-only', 'openid.sig': btoa('s'.repeat(32)),
    'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
  });
  const input = () => ({ state, browserBinding: binding, method: 'GET' as const, callbackUrl: `${expectedReturnTo}&${fields}` });
  return { state, stateHash, expectedReturnTo, fields, input };
}
function harness(overrides: Partial<Omit<OpenIdDependencies, 'lookupNonce'>> = {}) {
  const fetcher = vi.fn<OpenIdDependencies['fetcher']>().mockImplementation(async () => new Response(`ns:${OPENID_NAMESPACE}\nis_valid:true\n`));
  const discoverIdentity = vi.fn<OpenIdDependencies['discoverIdentity']>().mockImplementation(async claimedId => ({
    claimedId, identity: claimedId, opEndpoint: STEAM_OPENID_ENDPOINT, namespace: OPENID_NAMESPACE,
  }));
  return { fetcher, discoverIdentity, service: new D1OpenIdPreparation(db, { fetcher, discoverIdentity, now: () => now * 1000, ...overrides }) };
}
async function syntheticSession(stateHash: string, owner = alice, channel = 'desktop') {
  const created = await clock();
  const grantHash = await authHash('synthetic-code-' + stateHash);
  await db.prepare('INSERT INTO users (steam_id) VALUES (?) ON CONFLICT DO NOTHING').bind(owner).run();
  if (channel === 'desktop') await db.prepare(`INSERT INTO desktop_grants
    (code_hash, attempt_hash, steam_id, challenge_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(grantHash, stateHash, owner, challenge, created, created + 60).run();
  await db.prepare(`INSERT INTO sessions (token_hash, steam_id, client_kind, csrf_token_hash, created_at,
    expires_at, last_seen_at, source_attempt_hash, source_grant_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(token, owner, channel, channel === 'web' ? hash(91) : null, created, created + 3600, created, stateHash, channel === 'desktop' ? grantHash : null).run();
}
beforeEach(async () => {
  proxy = await database(); db = proxy.env.DB; now = await clock();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Real network forbidden'));
});
afterEach(async () => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); await proxy?.dispose(); });

describe('verificador + D1: preparação sem sessão ou rota de login', () => {
  it.each(['web', 'desktop'])('registra identidade %s e nonce numa instrução, sem usuário/grant/sessão', async channel => {
    const a = await attempt(1, channel);
    expect(await harness().service.verifyAndRecord(a.input())).toEqual({ ok: true, stage: 'assertion-recorded-no-session' });
    expect(await count('verified_openid_assertions')).toBe(1);
    expect(await count('openid_nonces')).toBe(1);
    expect(await count('users')).toBe(0);
    expect(await count('sessions')).toBe(0);
    expect(await count('desktop_grants')).toBe(0);
    const record = await db.prepare('SELECT * FROM verified_openid_assertions').first();
    expect(record).toMatchObject({ steam_id: alice, attempt_hash: a.stateHash, return_channel: channel });
    expect(JSON.stringify(record)).not.toContain(binding);
    expect((await db.prepare('SELECT consumed_at FROM auth_attempts').first())?.consumed_at).toBeNull();
    const nonce = await db.prepare('SELECT * FROM openid_nonces').first<{ created_at: number; expires_at: number }>();
    expect(nonce!.expires_at - nonce!.created_at).toBe(600);
    // Duas fases: tentativa já reivindicada para callback, consumo final fica nos guards 0005.
    expect(await harness().service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'invalid-attempt' });
  });

  it.each(['identity', 'return_to', 'op_endpoint', 'signed'])('nega adulteração de %s mesmo com is_valid:true simulado', async field => {
    const a = await attempt();
    a.fields.set(`openid.${field}`, field === 'signed' ? 'op_endpoint,return_to,response_nonce,assoc_handle' : 'https://evil.invalid/');
    const h = harness();
    expect((await h.service.verifyAndRecord(a.input())).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(await count('openid_nonces')).toBe(0);
    expect(await count('verified_openid_assertions')).toBe(0);
  });

  it('nega identidade coerentemente trocada quando descoberta não confirma o usuário', async () => {
    const a = await attempt();
    a.fields.set('openid.identity', `https://steamcommunity.com/openid/id/${bob}`);
    a.fields.set('openid.claimed_id', `https://steamcommunity.com/openid/id/${bob}`);
    const h = harness({ discoverIdentity: async () => ({ claimedId: `https://steamcommunity.com/openid/id/${alice}`, identity: `https://steamcommunity.com/openid/id/${alice}`, opEndpoint: STEAM_OPENID_ENDPOINT, namespace: OPENID_NAMESPACE }) });
    expect(await h.service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'discovery-failed' });
    expect(await count('verified_openid_assertions')).toBe(0);
  });

  it.each(['unknown', 'binding', 'malformed', 'consumed', 'expired'])('nega tentativa %s antes da rede simulada', async problem => {
    const a = await attempt(); const input = a.input();
    if (problem === 'unknown') input.state = 'z'.repeat(43);
    if (problem === 'binding') input.browserBinding = 'x'.repeat(43);
    if (problem === 'malformed') input.state = 'a'.repeat(10000);
    if (problem === 'consumed') await db.prepare('UPDATE auth_attempts SET consumed_at = unixepoch()').run();
    if (problem === 'expired') {
      // Snapshot histórico isolado, reinstalando o mesmo guard antes de testar.
      await db.prepare('DROP TRIGGER attempts_update_guard').run();
      await db.prepare('UPDATE auth_attempts SET created_at = ?, expires_at = ?').bind(now - 300, now).run();
      await db.prepare(migrationStatements(5).find(sql => sql.includes('CREATE TRIGGER attempts_update_guard'))!).run();
    }
    const h = harness();
    expect(await h.service.verifyAndRecord(input)).toEqual({ ok: false, error: 'invalid-attempt' });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(await count('openid_nonces')).toBe(0);
  });

  it.each(['consumed', 'expired'])('revalida tentativa %s durante a verificação, sem nonce parcial', async problem => {
    const a = await attempt();
    const h = harness({ discoverIdentity: async claimedId => {
      if (problem === 'consumed') await db.prepare('UPDATE auth_attempts SET consumed_at = unixepoch()').run();
      else {
        await db.prepare('DROP TRIGGER attempts_update_guard').run();
        await db.prepare('UPDATE auth_attempts SET created_at = ?, expires_at = ?').bind(now - 300, now).run();
        await db.prepare(migrationStatements(5).find(sql => sql.includes('CREATE TRIGGER attempts_update_guard'))!).run();
      }
      return { claimedId, identity: claimedId, opEndpoint: STEAM_OPENID_ENDPOINT, namespace: OPENID_NAMESPACE };
    } });
    expect(await h.service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'storage-failed' });
    expect(await count('openid_nonces')).toBe(0);
    expect(await count('verified_openid_assertions')).toBe(0);
  });

  it.each([-300, 61])('nega nonce fora da janela (%i s)', async delta => {
    const a = await attempt();
    a.fields.set('openid.response_nonce', new Date((now + delta) * 1000).toISOString().replace('.000Z', 'Z') + 'test');
    expect(await harness().service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'invalid-nonce' });
    expect(await count('openid_nonces')).toBe(0);
  });

  it.each([[-301, -200], [65, 10]])('relógio D1 rejeita nonce %i s mesmo se relógio do verificador divergir %i s', async (nonceDelta, clockDelta) => {
    const a = await attempt();
    a.fields.set('openid.response_nonce', new Date((now + nonceDelta) * 1000).toISOString().replace('.000Z', 'Z') + 'test');
    const h = harness({ now: () => (now + clockDelta) * 1000 });
    expect(await h.service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'storage-failed' });
    expect(h.fetcher).toHaveBeenCalledOnce();
    expect(await count('verified_openid_assertions')).toBe(0); expect(await count('openid_nonces')).toBe(0);
  });

  it('falha de rede e indisponibilidade D1 não deixam evidência de autenticação', async () => {
    const a = await attempt();
    const h = harness({ fetcher: async () => { throw new Error('synthetic network failure'); } });
    expect(await h.service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'unavailable' });
    const broken = { prepare: () => { throw new Error('private database detail'); } } as unknown as D1Database;
    const service = new D1OpenIdPreparation(broken, { fetcher: h.fetcher, discoverIdentity: h.discoverIdentity });
    expect(await service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'storage-failed' });
    expect(await count('verified_openid_assertions')).toBe(0);
  });

  it.each(['missing', 'error'])('consulta de nonce incompleta/falha (%s) nunca equivale a unseen', async problem => {
    const a = await attempt(); const h = harness();
    const broken = { prepare: (sql: string) => sql.startsWith('SELECT nonce_hash') ? {
      bind: () => ({ first: async () => {
        if (problem === 'missing') return undefined;
        throw new Error('private database detail');
      } }),
    } : db.prepare(sql) } as unknown as D1Database;
    const service = new D1OpenIdPreparation(broken, { fetcher: h.fetcher, discoverIdentity: h.discoverIdentity, now: () => now * 1000 });
    expect(await service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'unavailable' });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(await count('verified_openid_assertions')).toBe(0);
  });

  it('timeout do verificador não permite gravação tardia quando o transporte ignora abort', async () => {
    const a = await attempt();
    let finish!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { finish = resolve; });
    const fetcher = vi.fn<OpenIdDependencies['fetcher']>().mockImplementation(async () => response);
    const h = harness({ timeoutMs: 200, fetcher });
    expect(await h.service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'timeout' });
    expect(fetcher).toHaveBeenCalledOnce();
    finish(new Response(`ns:${OPENID_NAMESPACE}\nis_valid:true\n`));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(await count('verified_openid_assertions')).toBe(0); expect(await count('openid_nonces')).toBe(0);
  });

  it('nega o mesmo nonce em outra tentativa e após remoção da linha temporária do nonce', async () => {
    const a = await attempt(1), b = await attempt(2);
    expect((await harness().service.verifyAndRecord(a.input())).ok).toBe(true);
    expect(await harness().service.verifyAndRecord(b.input())).toEqual({ ok: false, error: 'replay' });
    await db.prepare('DELETE FROM openid_nonces').run();
    expect(await harness().service.verifyAndRecord(b.input())).toEqual({ ok: false, error: 'storage-failed' });
    expect(await count('verified_openid_assertions')).toBe(1);
  });

  it('falha de trigger do nonce faz rollback da asserção e permite nova tentativa íntegra', async () => {
    const a = await attempt();
    await db.prepare("CREATE TRIGGER test_nonce_failure BEFORE INSERT ON openid_nonces BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END").run();
    expect(await harness().service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'storage-failed' });
    expect(await count('verified_openid_assertions')).toBe(0); expect(await count('openid_nonces')).toBe(0);
    await db.prepare('DROP TRIGGER test_nonce_failure').run();
    expect((await harness().service.verifyAndRecord(a.input())).ok).toBe(true);
  });

  it('falha após escrita do nonce reverte as duas tabelas pelos triggers reais', async () => {
    const a = await attempt();
    // Trigger de teste falha após criar o nonce, dentro da mesma instrução.
    await db.prepare("CREATE TRIGGER test_after_nonce AFTER INSERT ON openid_nonces BEGIN INSERT INTO users (steam_id) VALUES ('invalid'); END").run();
    expect((await harness().service.verifyAndRecord(a.input())).ok).toBe(false);
    expect(await count('verified_openid_assertions')).toBe(0); expect(await count('openid_nonces')).toBe(0);
  });

  it.each(['same-attempt', 'same-nonce'])('concorrência local entre chamadas D1: %s tem um único vencedor', async mode => {
    const attempts = mode === 'same-attempt' ? [await attempt()] : [await attempt(1), await attempt(2)];
    const total = mode === 'same-attempt' ? 10 : 2;
    let arrived = 0; let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const dependencies = { fetcher: async () => {
      if (++arrived === total) release();
      await barrier;
      return new Response(`ns:${OPENID_NAMESPACE}\nis_valid:true\n`);
    } };
    const results = await Promise.all(Array.from({ length: total }, (_, i) => harness(dependencies).service.verifyAndRecord(attempts[i % attempts.length].input())));
    expect(arrived).toBe(total);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(await count('verified_openid_assertions')).toBe(1); expect(await count('openid_nonces')).toBe(1);
    expect(await count('sessions')).toBe(0);
  });

  it('contexto e asserção não permitem UPDATE, REPLACE ou reuso após limpeza da tentativa', async () => {
    const a = await attempt();
    expect((await harness().service.verifyAndRecord(a.input())).ok).toBe(true);
    await expect(db.prepare("UPDATE auth_attempt_contexts SET realm = 'https://evil.invalid/'").run()).rejects.toThrow();
    await expect(db.prepare('DELETE FROM auth_attempt_contexts').run()).rejects.toThrow();
    await expect(db.prepare('INSERT OR REPLACE INTO auth_attempt_contexts SELECT * FROM auth_attempt_contexts').run()).rejects.toThrow();
    await expect(db.prepare('UPDATE verified_openid_assertions SET steam_id = ?').bind(bob).run()).rejects.toThrow();
    await expect(db.prepare('INSERT OR REPLACE INTO verified_openid_assertions SELECT * FROM verified_openid_assertions').run()).rejects.toThrow();
    await expect(db.prepare('DELETE FROM verified_openid_assertions').run()).rejects.toThrow();
    await db.prepare('DELETE FROM auth_attempts').run();
    expect(await count('auth_attempt_contexts')).toBe(0);
    expect(await count('verified_openid_assertions')).toBe(1);
    await expect(attempt()).rejects.toThrow();
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });

  it.each(['binding', 'assertion-nonce', 'nonce-suffix'])('nega hash com NUL integralmente: %s', async target => {
    const a = await attempt();
    const embedded = 'f'.repeat(32) + '\0' + 'f'.repeat(31);
    if (target === 'binding') {
      await db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(hash(99), challenge, 'desktop', now, now + 300).run();
      await expect(db.prepare('INSERT INTO auth_attempt_contexts (attempt_hash, browser_binding_hash, expected_return_to, realm) VALUES (?, ?, ?, ?)')
        .bind(hash(99), embedded, a.expectedReturnTo, 'https://companion.example/').run()).rejects.toThrow();
    } else if (target === 'assertion-nonce') {
      await expect(db.prepare(`INSERT INTO verified_openid_assertions
        (attempt_hash, nonce_hash, steam_id, claimed_id, op_endpoint, return_channel, challenge_hash, verified_at, nonce_issued_at)
        VALUES (?, ?, ?, ?, ?, 'desktop', ?, unixepoch(), ?)`)
        .bind(a.stateHash, embedded, alice, `https://steamcommunity.com/openid/id/${alice}`, STEAM_OPENID_ENDPOINT, challenge, now).run()).rejects.toThrow();
    } else {
      await expect(db.prepare('INSERT INTO openid_nonces (nonce_hash, created_at, expires_at) VALUES (?, ?, ?)')
        .bind('f'.repeat(64) + '\0suffix', now, now + 600).run()).rejects.toThrow();
    }
    expect(await count('verified_openid_assertions')).toBe(0); expect(await count('openid_nonces')).toBe(0);
  });

  it('rotas HTTP reais do aplicativo continuam negando requisições concorrentes após uma asserção simulada', async () => {
    const a = await attempt(); await harness().service.verifyAndRecord(a.input());
    const responses = await Promise.all(Array.from({ length: 10 }, () => app.request('/auth/callback', {}, proxy.env)));
    expect(responses.every(response => response.status === 501 && !response.headers.has('Set-Cookie'))).toBe(true);
    expect((await app.request('/api/library', {}, proxy.env)).status).toBe(401);
    expect(await count('sessions')).toBe(0);
  });

  it('rollback da migração 0006 preserva o banco 0005 após falha posterior', async () => {
    await proxy.dispose(); proxy = await database(5); db = proxy.env.DB;
    await db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(alice).run();
    await expect(db.batch([...migrationStatements(6).map(sql => db.prepare(sql)),
      db.prepare("INSERT INTO users (steam_id) VALUES ('invalid')")])).rejects.toThrow();
    expect(await count('users')).toBe(1);
    expect(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'verified_openid_assertions'").first()).toBeNull();
    await db.batch(migrationStatements(6).map(sql => db.prepare(sql)));
    expect(await count('verified_openid_assertions')).toBe(0);
    expect((await db.prepare('PRAGMA quick_check').first())?.quick_check).toBe('ok');
  });
});

describe('leitura preparatória de proveniência, sem autorizar HTTP', () => {
  it.each(['web', 'desktop'])('exige cadeia completa %s e sobrevive à limpeza temporal sem apagar sessão', async channel => {
    const a = await attempt(1, channel); await harness().service.verifyAndRecord(a.input());
    await syntheticSession(a.stateHash, alice, channel);
    expect(await inspectSessionProvenance(db, token, channel as 'web' | 'desktop')).toEqual({ ok: true, stage: 'session-provenance-checked-not-authorized', steamId: alice });
    await db.prepare('DELETE FROM auth_attempts').run();
    expect((await inspectSessionProvenance(db, token, channel as 'web' | 'desktop')).ok).toBe(true);
    expect(await count('sessions')).toBe(1);
    expect((await app.request('/api/library', { headers: { Authorization: `Bearer ${token}` } }, proxy.env)).status).toBe(401);
  });

  it('nega sessão v1 sem asserção e identidade divergente, sem promover evidência retroativa', async () => {
    const a = await attempt(); await syntheticSession(a.stateHash);
    expect(await inspectSessionProvenance(db, token, 'desktop')).toEqual({ ok: false, error: 'rejected' });
    expect(await harness().service.verifyAndRecord(a.input())).toEqual({ ok: false, error: 'invalid-attempt' });
    const other = await attempt(2);
    other.fields.set('openid.response_nonce', other.fields.get('openid.response_nonce') + 'other');
    expect((await harness().service.verifyAndRecord(other.input())).ok).toBe(true);
    await db.prepare('DELETE FROM sessions').run();
    await syntheticSession(other.stateHash, bob);
    expect((await inspectSessionProvenance(db, token, 'desktop')).ok).toBe(false);
  });

  it('nega revogação, canal errado, token ausente/malformado e erro do banco', async () => {
    const a = await attempt(); await harness().service.verifyAndRecord(a.input()); await syntheticSession(a.stateHash);
    expect((await inspectSessionProvenance(db, token, 'web')).ok).toBe(false);
    expect((await inspectSessionProvenance(db, hash(99), 'desktop')).ok).toBe(false);
    expect((await inspectSessionProvenance(db, 'not-a-token-hash', 'desktop')).ok).toBe(false);
    await db.prepare('UPDATE sessions SET revoked_at = unixepoch()').run();
    expect((await inspectSessionProvenance(db, token, 'desktop')).ok).toBe(false);
    const broken = { prepare: () => { throw new Error('private internal detail'); } } as unknown as D1Database;
    expect(await inspectSessionProvenance(broken, token, 'desktop')).toEqual({ ok: false, error: 'unavailable' });
  });

  it('upgrade 0005→0006 preserva dados mas não inventa evidência para sessões existentes', async () => {
    await proxy.dispose(); proxy = await database(5); db = proxy.env.DB; now = await clock();
    const stateHash = hash(1);
    await db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(stateHash, challenge, 'desktop', now, now + 300).run();
    await syntheticSession(stateHash);
    const before = await db.prepare('SELECT * FROM sessions').first();
    await db.batch(migrationStatements(6).map(sql => db.prepare(sql)));
    expect(await db.prepare('SELECT * FROM sessions').first()).toEqual(before);
    expect(await count('verified_openid_assertions')).toBe(0);
    expect((await inspectSessionProvenance(db, token, 'desktop')).ok).toBe(false);
  });

  it('nega sessão legada v0 sem origem mesmo se ainda estiver dentro da validade', async () => {
    await proxy.dispose(); proxy = await database(4); db = proxy.env.DB; now = await clock();
    await db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(alice).run();
    await db.prepare(`INSERT INTO sessions (token_hash, steam_id, client_kind, created_at, expires_at, last_seen_at)
      VALUES (?, ?, 'desktop', ?, ?, ?)`).bind(token, alice, now, now + 3600, now).run();
    for (const number of [5, 6]) await db.batch(migrationStatements(number).map(sql => db.prepare(sql)));
    expect((await db.prepare('SELECT integrity_version FROM sessions').first())?.integrity_version).toBe(0);
    expect(await inspectSessionProvenance(db, token, 'desktop')).toEqual({ ok: false, error: 'rejected' });
  });

  it.each(['absolute', 'idle', 'idle-boundary', 'future'])('nega sessão histórica %s por relógio D1, mantendo origem coerente', async kind => {
    const a = await attempt(); expect((await harness().service.verifyAndRecord(a.input())).ok).toBe(true);
    await syntheticSession(a.stateHash);
    const created = now - 2000;
    const seen = kind === 'absolute' ? now - 10 : kind === 'future' ? now + 60 : now - (kind === 'idle' ? 901 : 900);
    const expires = kind === 'absolute' ? now : created + 3600;
    // Apenas fixture histórica: recoloca guards idênticos antes da consulta real.
    const names = ['sessions_update_guard', 'origins_update_guard', 'assertion_update_guard'];
    await db.batch([
      ...names.map(name => db.prepare(`DROP TRIGGER ${name}`)),
      db.prepare('UPDATE verified_openid_assertions SET verified_at = ?').bind(created - 1),
      db.prepare('UPDATE sessions SET created_at = ?, expires_at = ?, last_seen_at = ?').bind(created, expires, seen),
      db.prepare('UPDATE session_origins SET issued_at = ?').bind(created),
      ...names.map(name => db.prepare([...migrationStatements(5), ...migrationStatements(6)].find(sql => sql.includes(`CREATE TRIGGER ${name} `))!)),
    ]);
    expect(await inspectSessionProvenance(db, token, 'desktop')).toEqual({ ok: false, error: 'rejected' });
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });
});
