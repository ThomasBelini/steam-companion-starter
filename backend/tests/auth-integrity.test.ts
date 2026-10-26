import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { database, migrationStatements } from './d1';

const alice = '10000000000000000';
const bob = '20000000000000000';
const hash = (value: number) => value.toString(16).padStart(64, '0');
let proxy: Awaited<ReturnType<typeof database>>;
let db: typeof proxy.env.DB;
let now: number;

const clock = async () => (await db.prepare('SELECT unixepoch() AS now').first<{ now: number }>())!.now;
const row = (table: string, column: string, value: string) => db.prepare(`SELECT * FROM ${table} WHERE ${column} = ?`).bind(value).first();
const count = async (table: string) => (await db.prepare(`SELECT count(*) AS count FROM ${table}`).first<{ count: number }>())!.count;

function attempt(id = 1, channel = 'desktop', created = now, expires = created + 300) {
  return db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(hash(id), hash(99), channel, created, expires);
}
function grant(id = 1, state = 1, owner = alice, challenge = hash(99), created = now, expires = created + 60) {
  return db.prepare('INSERT INTO desktop_grants (code_hash, attempt_hash, steam_id, challenge_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(hash(id + 100), hash(state), owner, challenge, created, expires);
}
function session(id = 1, state = 1, grantId: number | null = 1, owner = alice, channel = 'desktop', created = now) {
  return db.prepare('INSERT INTO sessions (token_hash, steam_id, client_kind, csrf_token_hash, created_at, expires_at, last_seen_at, source_attempt_hash, source_grant_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(hash(id + 200), owner, channel, channel === 'web' ? hash(98) : null, created, created + 3600, created, hash(state), grantId === null ? null : hash(grantId + 100));
}
async function ready(id = 1) { await attempt(id).run(); await grant(id, id).run(); }
async function apply005() { await db.batch(migrationStatements(5).map(sql => db.prepare(sql))); }

beforeEach(async () => {
  proxy = await database(4);
  db = proxy.env.DB;
  now = await clock();
  await db.batch([alice, bob].map(id => db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(id)));
});
afterEach(async () => { await proxy?.dispose(); });

describe('0005: upgrade sem perda de dados', () => {
  it('preserva todos os campos anteriores e congela proveniência desconhecida como legado', async () => {
    await attempt(1, 'desktop', now - 300, now).run();
    // Formato permitido em 0003, mas consumo fora da validade: não inventar uma correção.
    await db.prepare('UPDATE auth_attempts SET consumed_at = ?').bind(now + 20).run();
    await grant(1, 1, alice, hash(97), now - 100, now - 40).run();
    await db.prepare('INSERT INTO user_settings (steam_id, settings_json) VALUES (?, ?)').bind(alice, '{"theme":"dark"}').run();
    await db.prepare('INSERT INTO user_wishlist (steam_id, app_id) VALUES (?, ?)').bind(alice, 101).run();
    await db.prepare('INSERT INTO user_goals (steam_id, app_id) VALUES (?, ?)').bind(bob, 202).run();
    for (const [id, created, expires, revoked] of [[1, now - 10, now + 100, null], [2, now - 10, now + 100, now], [3, now - 200, now - 100, null]]) {
      await db.prepare('INSERT INTO sessions (token_hash, steam_id, client_kind, created_at, expires_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(hash(id! + 200), alice, 'desktop', created, expires, created, revoked).run();
    }
    const tables = ['users', 'user_settings', 'user_wishlist', 'user_goals', 'auth_attempts', 'desktop_grants', 'sessions', 'openid_nonces'];
    const snapshots = await Promise.all(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    await apply005();
    for (const [index, table] of tables.entries()) {
      const after = await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      expect(after.results).toHaveLength(snapshots[index].results.length);
      for (const [i, previous] of snapshots[index].results.entries()) expect(after.results[i]).toMatchObject(previous);
    }
    expect((await row('sessions', 'token_hash', hash(201)))?.integrity_version).toBe(0);
    expect((await row('auth_attempts', 'state_hash', hash(1)))?.integrity_version).toBe(0);
    expect(await count('session_origins')).toBe(0);
    await expect(session(4).run()).rejects.toThrow();
    await expect(db.prepare('UPDATE sessions SET integrity_version = 1 WHERE token_hash = ?').bind(hash(201)).run()).rejects.toThrow();
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect((await db.prepare('PRAGMA quick_check').first())?.quick_check).toBe('ok');
  });

  it('rollback de uma migração falha restaura DDL e dados legados', async () => {
    await attempt().run();
    const before = await row('auth_attempts', 'state_hash', hash(1));
    await expect(db.batch([
      ...migrationStatements(5).map(sql => db.prepare(sql)),
      db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind('invalid'),
    ])).rejects.toThrow();
    expect(await row('auth_attempts', 'state_hash', hash(1))).toEqual(before);
    const columns = (await db.prepare('PRAGMA table_info(sessions)').all()).results.map(column => column.name);
    expect(columns).not.toContain('source_attempt_hash');
    expect((await db.prepare("SELECT name FROM sqlite_master WHERE name = 'session_origins'").all()).results).toEqual([]);
    await apply005();
    expect((await row('auth_attempts', 'state_hash', hash(1)))?.integrity_version).toBe(0);
  });

  it('confirma a exceção NUL anterior e bloqueia novas representações ambíguas após upgrade', async () => {
    const oldId = '30000000000000000\0suffix';
    await db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(oldId).run();
    await apply005();
    // Sem apagar silenciosamente dados existentes; validar identidades antes de login real.
    expect(await row('users', 'steam_id', oldId)).not.toBeNull();
    await expect(db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind('40000000000000000\0suffix').run()).rejects.toThrow('Invalid SteamID64 representation');
    await expect(db.prepare('UPDATE users SET steam_id = ? WHERE steam_id = ?').bind('50000000000000000\0suffix', alice).run()).rejects.toThrow();
  });
});

describe('0005: tentativas, grants e emissão única', () => {
  beforeEach(apply005);

  it('uma inserção desktop consome grant e registra uma única origem', async () => {
    await ready();
    expect((await row('auth_attempts', 'state_hash', hash(1)))?.consumed_at).toBe(now);
    await session().run();
    expect((await row('desktop_grants', 'code_hash', hash(101)))?.consumed_at).toBe(now);
    expect(await row('session_origins', 'attempt_hash', hash(1))).toMatchObject({ grant_hash: hash(101), session_hash: hash(201), steam_id: alice });
    await expect(session(2).run()).rejects.toThrow();
    expect(await count('sessions')).toBe(1);
  });

  it('uma tentativa web também só origina uma sessão, com CSRF', async () => {
    await attempt(1, 'web').run();
    await session(1, 1, null, alice, 'web').run();
    await expect(session(2, 1, null, alice, 'web').run()).rejects.toThrow();
    expect((await row('auth_attempts', 'state_hash', hash(1)))?.consumed_at).toBe(now);
  });

  it.each(['owner', 'challenge', 'channel', 'missing', 'expiry', 'created'])('rejeita grant com vínculo inválido: %s', async kind => {
    if (kind !== 'missing') await attempt(1, kind === 'channel' ? 'web' : 'desktop', now - 10, now + 30).run();
    const owner = kind === 'owner' ? '30000000000000000' : alice;
    await expect(grant(1, 1, owner, kind === 'challenge' ? hash(88) : hash(99), kind === 'created' ? now - 11 : now, kind === 'expiry' ? now + 31 : now + 20).run()).rejects.toThrow();
    expect(await count('desktop_grants')).toBe(0);
    if (kind !== 'missing') expect((await row('auth_attempts', 'state_hash', hash(1)))?.consumed_at).toBeNull();
  });

  it.each(['owner', 'attempt', 'grant', 'channel', 'missing'])('rejeita sessão com vínculo inválido: %s', async kind => {
    await ready();
    await expect(session(1, kind === 'attempt' ? 2 : 1, kind === 'missing' ? null : kind === 'grant' ? 2 : 1, kind === 'owner' ? bob : alice, kind === 'channel' ? 'web' : 'desktop').run()).rejects.toThrow();
    expect(await count('sessions')).toBe(0);
    expect((await row('desktop_grants', 'code_hash', hash(101)))?.consumed_at).toBeNull();
  });

  it.each(['created_at', 'expires_at', 'challenge_hash', 'return_channel', 'state_hash', 'integrity_version'])('tentativa tem campo imutável: %s', async field => {
    await attempt().run();
    const value = field.endsWith('_at') ? now + 1 : field === 'integrity_version' ? 0 : field === 'return_channel' ? 'web' : hash(77);
    await expect(db.prepare(`UPDATE auth_attempts SET ${field} = ?`).bind(value).run()).rejects.toThrow();
  });

  it.each(['attempt_hash', 'steam_id', 'challenge_hash', 'expires_at', 'code_hash'])('grant tem campo imutável: %s', async field => {
    await ready();
    const value = field === 'steam_id' ? bob : field === 'expires_at' ? now + 30 : hash(77);
    await expect(db.prepare(`UPDATE desktop_grants SET ${field} = ?`).bind(value).run()).rejects.toThrow();
  });

  it('consumo não pode ser limpo, movido ou falsificado no futuro', async () => {
    await ready();
    await expect(db.prepare('UPDATE auth_attempts SET consumed_at = NULL').run()).rejects.toThrow();
    await expect(db.prepare('UPDATE auth_attempts SET consumed_at = ?').bind(now + 1).run()).rejects.toThrow();
    await expect(db.prepare('UPDATE desktop_grants SET consumed_at = ?').bind(now + 120).run()).rejects.toThrow();
    await session().run();
    await expect(db.prepare('UPDATE desktop_grants SET consumed_at = NULL').run()).rejects.toThrow();
  });

  it('não aceita inserção antecipadamente consumida ou com versão legada', async () => {
    await expect(db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(hash(1), hash(99), 'desktop', now, now + 300, now).run()).rejects.toThrow();
    await expect(db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at, integrity_version) VALUES (?, ?, ?, ?, ?, 0)')
      .bind(hash(1), hash(99), 'desktop', now, now + 300).run()).rejects.toThrow();
  });

  it('hashes têm representação textual integral de 64 bytes, sem NUL ou BLOB', async () => {
    await expect(db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(`${hash(1)}\0suffix`, hash(99), 'desktop', now, now + 300).run()).rejects.toThrow();
    await expect(db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (CAST(? AS BLOB), ?, ?, ?, ?)')
      .bind(hash(1), hash(99), 'desktop', now, now + 300).run()).rejects.toThrow();
    await ready();
    await expect(db.prepare('INSERT INTO sessions (token_hash, steam_id, client_kind, created_at, expires_at, last_seen_at, source_attempt_hash, source_grant_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(`${hash(201)}\0suffix`, alice, 'desktop', now, now + 3600, now, hash(1), hash(101)).run()).rejects.toThrow();
    expect((await row('desktop_grants', 'code_hash', hash(101)))?.consumed_at).toBeNull();
  });

  it('bloqueia INSERT OR REPLACE sem apagar os registros originais', async () => {
    await ready();
    await session().run();
    for (const [table, key, value] of [['auth_attempts', 'state_hash', hash(1)], ['desktop_grants', 'code_hash', hash(101)], ['sessions', 'token_hash', hash(201)], ['session_origins', 'attempt_hash', hash(1)]]) {
      const before = await row(table, key, value);
      await expect(db.prepare(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE ${key} = ?`).bind(value).run()).rejects.toThrow();
      expect(await row(table, key, value)).toEqual(before);
    }
  });

  it('limpeza de tentativa/grant não apaga sessão válida nem libera sua origem', async () => {
    await ready(); await session().run();
    await db.prepare('DELETE FROM auth_attempts').run();
    expect(await count('desktop_grants')).toBe(0);
    expect(await count('sessions')).toBe(1);
    expect(await count('session_origins')).toBe(1);
    await expect(attempt().run()).rejects.toThrow();
    await expect(db.prepare('DELETE FROM session_origins').run()).rejects.toThrow();
    await expect(db.prepare('UPDATE session_origins SET grant_hash = NULL').run()).rejects.toThrow();
    await db.prepare('DELETE FROM sessions').run();
    expect((await row('session_origins', 'attempt_hash', hash(1)))?.session_hash).toBeNull();
    await expect(attempt().run()).rejects.toThrow();
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });

  it('exclusão do usuário remove seus registros e preserva o outro usuário', async () => {
    await ready(); await session().run();
    await db.prepare('INSERT INTO user_settings (steam_id) VALUES (?)').bind(bob).run();
    await db.prepare('DELETE FROM users WHERE steam_id = ?').bind(alice).run();
    for (const table of ['sessions', 'session_origins', 'desktop_grants']) expect(await count(table)).toBe(0);
    expect(await row('users', 'steam_id', bob)).not.toBeNull();
    expect(await count('user_settings')).toBe(1);
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });

  it('falha posterior no batch reverte sessão, histórico e consumo dos triggers', async () => {
    await ready();
    await expect(db.batch([session(), db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind('invalid')])).rejects.toThrow();
    expect(await count('sessions')).toBe(0);
    expect(await count('session_origins')).toBe(0);
    expect((await row('desktop_grants', 'code_hash', hash(101)))?.consumed_at).toBeNull();
    await session().run();
  });

  it('duas emissões no mesmo batch falham e revertem inclusive a primeira', async () => {
    await ready();
    await expect(db.batch([session(1), session(2)])).rejects.toThrow();
    expect(await count('sessions')).toBe(0);
    expect(await count('session_origins')).toBe(0);
    expect((await row('desktop_grants', 'code_hash', hash(101)))?.consumed_at).toBeNull();
    await session().run();
  });

  it('um grant emitido não pode ser reciclado em outra tentativa após limpeza', async () => {
    await ready(); await session().run();
    await db.prepare('DELETE FROM auth_attempts').run();
    await attempt(2).run();
    await expect(grant(1, 2).run()).rejects.toThrow('Invalid grant origin');
    expect((await row('auth_attempts', 'state_hash', hash(2)))?.consumed_at).toBeNull();
  });

  it('20 inserções D1 sobre o mesmo grant: exatamente uma vence, sem HTTP', async () => {
    await ready();
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => session(i + 1).run()));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await count('sessions')).toBe(1);
    expect(await count('session_origins')).toBe(1);
  });

  it('20 grants concorrentes na mesma tentativa: exatamente um vence', async () => {
    await attempt().run();
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => grant(i + 1).run()));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await count('desktop_grants')).toBe(1);
  });

  it('20 sessões web concorrentes na mesma tentativa: exatamente uma vence', async () => {
    await attempt(1, 'web').run();
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => session(i + 1, 1, null, alice, 'web').run()));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await count('sessions')).toBe(1);
  });

  it.each(['30000000000000000', '99999999999999999', '100000000000000000', '18446744073709551615'])('preserva sintaxe uint64 sem impor prefixo: %s', async steamId => {
    await db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(steamId).run();
    expect(await row('users', 'steam_id', steamId)).not.toBeNull();
  });

  it.each(['0', '01234567890123456', '18446744073709551616', '1e17'])('rejeita formato SteamID64 inválido: %s', async steamId => {
    await expect(db.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(steamId).run()).rejects.toThrow();
  });
});

describe('0005: sessões não podem ser reativadas por UPDATE', () => {
  beforeEach(apply005);

  it.each(['expires_at', 'created_at', 'steam_id', 'token_hash', 'source_attempt_hash', 'source_grant_hash', 'client_kind', 'integrity_version'])('congela identidade e prazos: %s', async field => {
    await ready(); await session().run();
    const value = field.endsWith('_at') ? now + 100 : field === 'steam_id' ? bob : field === 'client_kind' ? 'web' : field === 'integrity_version' ? 0 : hash(77);
    await expect(db.prepare(`UPDATE sessions SET ${field} = ?`).bind(value).run()).rejects.toThrow();
  });

  it('revogação é irreversível, idempotente e não admite tempo futuro', async () => {
    await ready(); await session().run();
    await expect(db.prepare('UPDATE sessions SET revoked_at = ?').bind(now + 100).run()).rejects.toThrow();
    await db.prepare('UPDATE sessions SET revoked_at = ?').bind(now).run();
    await db.prepare('UPDATE sessions SET revoked_at = ?').bind(now).run();
    await expect(db.prepare('UPDATE sessions SET revoked_at = NULL').run()).rejects.toThrow();
    await expect(db.prepare('UPDATE sessions SET revoked_at = ?').bind(now - 1).run()).rejects.toThrow();
    await expect(db.prepare('UPDATE sessions SET last_seen_at = ?').bind(now + 1).run()).rejects.toThrow();
    await expect(session(2).run()).rejects.toThrow();
  });

  it('atividade futura não estende a sessão; atividade atual válida pode avançar', async () => {
    await attempt(1, 'web', now - 2, now + 200).run();
    await session(1, 1, null, alice, 'web', now - 1).run();
    await expect(db.prepare('UPDATE sessions SET last_seen_at = ?').bind(now + 100).run()).rejects.toThrow();
    await db.prepare('UPDATE sessions SET last_seen_at = ?').bind(now).run();
    await expect(db.prepare('UPDATE sessions SET last_seen_at = ?').bind(now - 1).run()).rejects.toThrow();
    expect((await row('sessions', 'token_hash', hash(201)))?.expires_at).toBe(now - 1 + 3600);
  });

  it.each(['future', 'expired', 'fractional', 'text'])('timestamp de tentativa inválido: %s', async kind => {
    const created = kind === 'future' ? now + 30 : kind === 'expired' ? now - 300 : kind === 'fractional' ? now + 0.5 : 'yesterday';
    await expect(db.prepare('INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(hash(1), hash(99), 'desktop', created, kind === 'expired' ? now : now + 300).run()).rejects.toThrow();
  });
});

describe('0005: snapshots históricos v1 com os mesmos triggers', () => {
  // Relógio D1 é real: construir snapshot válido antes da instalação dos guards,
  // representando um banco cujo relógio avançou. Não há bypass no código do produto.
  it.each(['idle', 'absolute', 'revoked'])('não reativa snapshot %s', async kind => {
    const sql = migrationStatements(5);
    const firstTrigger = sql.findIndex(statement => /CREATE TRIGGER/.test(statement));
    await db.batch(sql.slice(0, firstTrigger).map(statement => db.prepare(statement)));
    const created = now - 1000;
    const expires = kind === 'absolute' ? now - 1 : now + 100;
    const lastSeen = kind === 'idle' ? now - 900 : now - 10;
    await db.batch([
      db.prepare('INSERT INTO sessions (token_hash, steam_id, client_kind, csrf_token_hash, created_at, expires_at, last_seen_at, revoked_at, source_attempt_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(hash(201), alice, 'web', hash(98), created, expires, lastSeen, kind === 'revoked' ? now - 5 : null, hash(1)),
      db.prepare('INSERT INTO session_origins (attempt_hash, steam_id, session_hash, issued_at) VALUES (?, ?, ?, ?)')
        .bind(hash(1), alice, hash(201), created),
    ]);
    await db.batch(sql.slice(firstTrigger).map(statement => db.prepare(statement)));
    await expect(db.prepare('UPDATE sessions SET last_seen_at = ?').bind(now).run()).rejects.toThrow();
    await expect(db.prepare('UPDATE sessions SET expires_at = ?').bind(now + 3600).run()).rejects.toThrow();
    if (kind === 'revoked') await expect(db.prepare('UPDATE sessions SET revoked_at = NULL').run()).rejects.toThrow();
    expect((await row('sessions', 'token_hash', hash(201)))?.last_seen_at).toBe(lastSeen);
  });
});
