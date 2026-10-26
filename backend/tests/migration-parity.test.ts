import type { D1Database } from '@cloudflare/workers-types';
import { createHash } from 'node:crypto';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { migrationStatements } from './d1';
import type { Bindings } from '../src/bindings';
import { inspectSessionProvenance } from '../src/auth/D1SessionProvenance.server';

const alice = '10000000000000000', bob = '20000000000000000';
const hash = (id: number) => id.toString(16).padStart(64, '0');
const tables = ['users', 'user_settings', 'user_wishlist', 'user_goals', 'auth_attempts', 'desktop_grants', 'sessions', 'openid_nonces', 'session_origins'];
async function migrate(db: D1Database, from: number, through: number) {
  for (let version = from; version <= through; version++) {
    await db.batch(migrationStatements(version).map(sql => db.prepare(sql)));
  }
}
async function snapshot(db: D1Database) {
  return Promise.all(tables.map(async table => ({ table, rows: (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results })));
}
async function schema(db: D1Database) {
  // CREATE TABLE contém os CHECK/UNIQUE; CREATE INDEX/TRIGGER também é comparado integralmente.
  const objects = (await db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name`).all()).results;
  const metadata = [];
  for (const object of objects.filter(object => object.type === 'table')) {
    const name = String(object.name);
    if (!/^[a-z_]+$/.test(name)) throw new Error('Unexpected schema name');
    metadata.push({ name,
      columns: (await db.prepare(`PRAGMA table_info(${name})`).all()).results,
      foreignKeys: (await db.prepare(`PRAGMA foreign_key_list(${name})`).all()).results,
      indexes: (await db.prepare(`PRAGMA index_list(${name})`).all()).results,
    });
  }
  return { objects, metadata };
}
function pending(db: D1Database, id: number, now: number, channel = 'desktop') {
  return db.prepare(`INSERT INTO auth_attempts (state_hash, challenge_hash, return_channel, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`).bind(hash(id), hash(99), channel, now, now + 300);
}
function context(db: D1Database, id: number, binding = hash(101)) {
  return db.prepare(`INSERT INTO auth_attempt_contexts (attempt_hash, browser_binding_hash, expected_return_to, realm)
    VALUES (?, ?, 'https://companion.example/auth/callback?state=synthetic-only', 'https://companion.example/')`).bind(hash(id), binding);
}
async function rejectNul(db: D1Database) {
  const now = (await db.prepare('SELECT unixepoch() AS now').first<{ now: number }>())!.now;
  const embedded = 'f'.repeat(32) + '\0' + 'f'.repeat(31);
  await expect(db.batch([pending(db, 100, now), context(db, 100, embedded)])).rejects.toThrow('Invalid browser hash representation');
  await expect(db.batch([pending(db, 110, now), context(db, 110),
    db.prepare(`INSERT INTO verified_openid_assertions
      (attempt_hash, nonce_hash, steam_id, claimed_id, op_endpoint, return_channel, challenge_hash, verified_at, nonce_issued_at)
      VALUES (?, ?, ?, ?, 'https://steamcommunity.com/openid/login', 'desktop', ?, unixepoch(), ?)`)
      .bind(hash(110), embedded, alice, `https://steamcommunity.com/openid/id/${alice}`, hash(99), now),
  ])).rejects.toThrow('Invalid assertion hash representation');
  await expect(db.prepare('INSERT INTO openid_nonces (nonce_hash, created_at, expires_at) VALUES (?, ?, ?)')
    .bind('f'.repeat(64) + '\0suffix', now, now + 600).run()).rejects.toThrow('Invalid nonce hash representation');
}

it('0001–0006 limpo e upgrade 0005→0006 têm schema idêntico, preservam dados e negam legado/NUL', async () => {
  const root = mkdtempSync(join(tmpdir(), 'steam-companion-migration-'));
  const safeRoot = resolve(root);
  if (!safeRoot.startsWith(resolve(tmpdir()) + sep) || !basename(safeRoot).startsWith('steam-companion-migration-')) throw new Error('Unsafe temporary cleanup target');
  const proxies: PlatformProxy<Bindings>[] = [];
  let report: Record<string, unknown> | undefined;
  try {
    for (const name of ['fresh', 'upgrade']) {
      const state = join(root, name);
      mkdirSync(state);
      expect(resolve(state)).not.toBe(resolve('.wrangler/state'));
      proxies.push(await getPlatformProxy<Bindings>({ configPath: 'backend/tests/wrangler.test.json',
        persist: { path: state }, remoteBindings: false, envFiles: [],
      }));
    }
    const [fresh, upgrade] = proxies.map(proxy => proxy.env.DB);
    await migrate(fresh, 1, 6);
    await migrate(upgrade, 1, 4);
    const now = (await upgrade.prepare('SELECT unixepoch() AS now').first<{ now: number }>())!.now;
    await upgrade.batch([
      ...[alice, bob].map(id => upgrade.prepare('INSERT INTO users (steam_id) VALUES (?)').bind(id)),
      ...[alice, bob].map(id => upgrade.prepare('INSERT INTO user_settings (steam_id, settings_json) VALUES (?, ?)').bind(id, '{"theme":"graphite","language":"pt-BR"}')),
      ...[alice, bob].map((id, index) => upgrade.prepare('INSERT INTO user_wishlist (steam_id, app_id) VALUES (?, ?)').bind(id, 101 + index)),
      ...[alice, bob].map((id, index) => upgrade.prepare("INSERT INTO user_goals (steam_id, app_id, state) VALUES (?, ?, 'active')").bind(id, 201 + index)),
      pending(upgrade, 1, now),
      upgrade.prepare(`INSERT INTO desktop_grants (code_hash, attempt_hash, steam_id, challenge_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(hash(2), hash(1), alice, hash(99), now, now + 60),
      upgrade.prepare(`INSERT INTO sessions (token_hash, steam_id, client_kind, created_at, expires_at, last_seen_at)
        VALUES (?, ?, 'desktop', ?, ?, ?)`).bind(hash(3), alice, now, now + 3600, now),
      upgrade.prepare('INSERT INTO openid_nonces (nonce_hash, created_at, expires_at) VALUES (?, ?, ?)').bind(hash(4), now, now + 600),
    ]);
    await migrate(upgrade, 5, 5);
    // Estado v1 criado sob 0005: origem estrutural existe, mas nenhuma asserção comprovada.
    await upgrade.batch([
      pending(upgrade, 10, now),
      upgrade.prepare(`INSERT INTO desktop_grants (code_hash, attempt_hash, steam_id, challenge_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(hash(11), hash(10), bob, hash(99), now, now + 60),
      upgrade.prepare(`INSERT INTO sessions (token_hash, steam_id, client_kind, created_at, expires_at, last_seen_at, source_attempt_hash, source_grant_hash)
        VALUES (?, ?, 'desktop', ?, ?, ?, ?, ?)`).bind(hash(12), bob, now, now + 3600, now, hash(10), hash(11)),
      pending(upgrade, 20, now, 'web'),
      upgrade.prepare(`INSERT INTO sessions (token_hash, steam_id, client_kind, csrf_token_hash, created_at, expires_at, last_seen_at, source_attempt_hash)
        VALUES (?, ?, 'web', ?, ?, ?, ?, ?)`).bind(hash(21), alice, hash(22), now, now + 3600, now, hash(20)),
      pending(upgrade, 30, now, 'web'),
      upgrade.prepare(`INSERT INTO sessions (token_hash, steam_id, client_kind, csrf_token_hash, created_at, expires_at, last_seen_at, source_attempt_hash)
        VALUES (?, ?, 'web', ?, ?, ?, ?, ?)`).bind(hash(31), bob, hash(32), now, now + 3600, now, hash(30)),
      upgrade.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(now, hash(31)),
    ]);
    const before = await snapshot(upgrade);
    await migrate(upgrade, 6, 6);
    expect(await snapshot(upgrade)).toEqual(before);
    const freshSchema = await schema(fresh);
    expect(await schema(upgrade)).toEqual(freshSchema);
    const guards = freshSchema.objects.filter(object => String(object.name).endsWith('_hash_bytes_guard')).map(object => object.name).sort();
    expect(guards).toEqual(['assertion_hash_bytes_guard', 'context_hash_bytes_guard', 'nonce_hash_bytes_guard']);
    for (const db of [fresh, upgrade]) {
      expect((await db.prepare('PRAGMA quick_check').first())?.quick_check).toBe('ok');
      expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
      await rejectNul(db);
      expect((await db.prepare('PRAGMA quick_check').first())?.quick_check).toBe('ok');
      expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
      expect((await db.prepare('SELECT count(*) AS count FROM verified_openid_assertions').first())?.count).toBe(0);
    }
    expect(await snapshot(upgrade)).toEqual(before); // Negativos não deixam escritas parciais.
    for (const [id, channel] of [[3, 'desktop'], [12, 'desktop'], [21, 'web'], [31, 'web']] as const) {
      expect(await inspectSessionProvenance(upgrade, hash(id), channel)).toEqual({ ok: false, error: 'rejected' });
    }
    report = { migrationParity: 'passed', schemaSha256: createHash('sha256').update(JSON.stringify(freshSchema)).digest('hex'),
      tables: freshSchema.metadata.length, triggers: freshSchema.objects.filter(object => object.type === 'trigger').length,
      preservedRows: before.reduce((sum, table) => sum + table.rows.length, 0), rejectedExistingSessions: 4, nulGuards: guards.length,
      fresh: { quickCheck: 'ok', foreignKeyViolations: 0 }, upgrade: { quickCheck: 'ok', foreignKeyViolations: 0 } };
  } finally {
    await Promise.all(proxies.map(proxy => proxy.dispose()));
    rmSync(safeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  console.info(JSON.stringify(report));
});
