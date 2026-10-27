import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, request } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { database, migrationStatements } from './d1';
import { D1SimulatedProtocol } from '../src/simulation/D1SimulatedProtocol.server';
import { canonicalSecret, challengeHex, randomSimulationSecret, SimulatedIdentityProvider, type SimulatedSubject } from '../src/simulation/SimulatedIdentityProvider.server';
import { authHash } from '../src/auth/D1OpenIdPreparation.server';
import { inspectSessionProvenance } from '../src/auth/D1SessionProvenance.server';
import app from '../src/index';

let proxy: Awaited<ReturnType<typeof database>>, db: D1Database;
let provider: SimulatedIdentityProvider, service: D1SimulatedProtocol;
const clock = async () => (await db.prepare('SELECT unixepoch() AS now').first<{ now: number }>())!.now;
const count = async (table: string) => (await db.prepare(`SELECT count(*) AS count FROM ${table}`).first<{ count: number }>())!.count;
const s256 = async (verifier: string) => btoa(String.fromCharCode(...Uint8Array.from((await authHash(verifier)).match(/../g)!, x => parseInt(x, 16))))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
async function start(subject: SimulatedSubject = 'demo:alice') {
  // Simula um cliente nativo independente; verifier nunca passa ao navegador/provider.
  const verifier = randomSimulationSecret();
  const begun = await service.begin(await s256(verifier));
  if (!begun.ok) throw new Error('Fixture start failed');
  const browser = begun.browser;
  const native = { state: browser.state, verifier };
  const envelope = await provider.issue({ ...browser, subject }, await clock());
  return { browser, native, envelope, subject };
}
async function ready(subject: SimulatedSubject = 'demo:alice') {
  const fixture = await start(subject);
  expect(await service.recordIdentity(fixture.browser, fixture.envelope)).toEqual({ ok: true, stage: 'simulated-identity-recorded' });
  expect((await service.approveIdentity(fixture.native, subject)).ok).toBe(true);
  const grant = await service.prepareCode(fixture.browser);
  if (!grant.ok) throw new Error('Fixture code failed');
  return { ...fixture, redeem: { ...fixture.native, code: grant.code, expectedSubject: subject } };
}
async function historical(table: 'simulation_attempts' | 'simulation_grants', hash: string) {
  // Fixture histórica em DB efêmero; restaura o guard original ANTES da operação testada.
  const trigger = table === 'simulation_attempts' ? 'simulation_attempt_update' : 'simulation_grant_update';
  const key = table === 'simulation_attempts' ? 'state_hash' : 'code_hash';
  await db.prepare(`DROP TRIGGER ${trigger}`).run();
  const lifetime = table === 'simulation_attempts' ? 300 : 60;
  await db.prepare(`UPDATE ${table} SET created_at = unixepoch() - ?, expires_at = unixepoch() WHERE ${key} = ?`).bind(lifetime, hash).run();
  await db.prepare(migrationStatements(7).find(sql => sql.includes(`CREATE TRIGGER ${trigger} `))!).run();
}
beforeEach(async () => {
  proxy = await database(); db = proxy.env.DB;
  provider = await SimulatedIdentityProvider.create(); service = new D1SimulatedProtocol(db, provider);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Real network forbidden'));
});
afterEach(async () => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks(); await proxy?.dispose();
});

describe('protocolo interno D1 — somente identidades fictícias', () => {
  it('dois usuários e dois dispositivos independentes concluem sem criar dados reais', async () => {
    const a = await ready(), b = await ready('demo:bob');
    for (const device of [a, b]) {
      expect(await service.redeem(device.redeem)).toEqual({ ok: true, stage: 'simulation-completed-no-session', subject: device.subject });
    }
    expect(await count('simulation_grants')).toBe(2);
    for (const table of ['users', 'sessions', 'session_origins', 'auth_attempts', 'auth_attempt_contexts', 'desktop_grants', 'verified_openid_assertions', 'openid_nonces']) {
      expect(await count(table)).toBe(0);
    }
  });

  it('usa exatamente os bytes S256 do Rust e o vetor público RFC 7636', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(await s256(verifier)).toBe(challenge);
    expect(challengeHex(challenge)).toBe(await authHash(verifier));
    expect(canonicalSecret(verifier)).toBe(true);
  });

  it.each(['', 'plain', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(64), 'A'.repeat(42) + 'B', 'a'.repeat(42) + '\0'])('recusa desafio malformado (%#)', async value => {
    expect((await service.begin(value)).ok).toBe(false);
    expect(await count('simulation_attempts')).toBe(0);
  });

  it('B não resgata código de A, mesmo sabendo URL/state e código', async () => {
    const a = await ready(), b = await ready('demo:bob');
    for (const attack of [
      { ...b.redeem, code: a.redeem.code },
      { ...a.redeem, verifier: b.native.verifier },
      { ...a.redeem, expectedSubject: b.subject },
      { ...a.redeem, state: randomSimulationSecret() },
    ]) expect((await service.redeem(attack)).ok).toBe(false);
    expect((await service.redeem(a.redeem)).ok).toBe(true);
    expect((await service.redeem(b.redeem)).ok).toBe(true);
  });

  it('não permite confirmar identidade com segredo de outro dispositivo', async () => {
    const a = await start(), b = await start('demo:bob');
    await service.recordIdentity(a.browser, a.envelope);
    expect((await service.approveIdentity({ ...a.native, verifier: b.native.verifier }, a.subject)).ok).toBe(false);
    expect((await service.approveIdentity(a.native, b.subject)).ok).toBe(false);
    expect((await service.prepareCode(a.browser)).ok).toBe(false);
  });

  it.each(['browserBinding', 'csrf', 'state'] as const)('URL/cookie sem prova %s correspondente não confirma identidade nem código', async field => {
    const a = await start();
    const forged = { ...a.browser, [field]: randomSimulationSecret() };
    expect((await service.recordIdentity(forged, a.envelope)).ok).toBe(false);
    expect(await count('simulation_assertions')).toBe(0);
    await service.recordIdentity(a.browser, a.envelope);
    await service.approveIdentity(a.native, a.subject);
    expect((await service.prepareCode(forged)).ok).toBe(false);
    expect((await service.prepareCode(a.browser)).ok).toBe(true);
  });

  it.each(['subject', 'issuer', 'attemptHash', 'nonce', 'issuedAt'])('recusa adulteração de %s no mock assinado', async field => {
    const a = await start();
    const fields = JSON.parse(a.envelope.payload) as Record<string, unknown>;
    fields[field] = field === 'issuedAt' ? await clock() + 300 : field === 'subject' ? 'demo:bob' : 'forged';
    expect((await service.recordIdentity(a.browser, { ...a.envelope, payload: JSON.stringify(fields) })).ok).toBe(false);
    expect(await count('simulation_assertions')).toBe(0);
  });

  it('booleano, provedor diferente e evidência malformada não comprovam identidade', async () => {
    const a = await start();
    const other = await SimulatedIdentityProvider.create();
    const envelopes = [
      { payload: '{"is_valid":true}', signature: randomSimulationSecret() },
      { payload: 'x'.repeat(2000), signature: randomSimulationSecret() },
      { payload: '{broken', signature: randomSimulationSecret() },
      { ...a.envelope, signature: '' },
      await other.issue({ ...a.browser, subject: a.subject }),
    ];
    for (const envelope of envelopes) expect((await service.recordIdentity(a.browser, envelope)).ok).toBe(false);
    expect((await service.approveIdentity(a.native, a.subject)).ok).toBe(false);
    expect((await service.prepareCode(a.browser)).ok).toBe(false);
    expect((await service.redeem({ ...a.native, code: randomSimulationSecret(), expectedSubject: a.subject })).ok).toBe(false);
  });

  it('verifica e interpreta o mesmo snapshot da evidência, mesmo se o chamador mutar o objeto', async () => {
    const a = await start();
    const evidence = { ...a.envelope };
    const verification = provider.verify(evidence);
    evidence.payload = evidence.payload.replace('demo:alice', 'demo:bob');
    expect((await verification)?.subject).toBe('demo:alice');
  });

  it('recusa evidência de outra tentativa e troca posterior de identidade', async () => {
    const a = await start(), b = await start('demo:bob');
    expect((await service.recordIdentity(a.browser, b.envelope)).ok).toBe(false);
    expect((await service.recordIdentity(a.browser, a.envelope)).ok).toBe(true);
    const switched = await provider.issue({ ...a.browser, subject: 'demo:bob' }, await clock());
    expect((await service.recordIdentity(a.browser, switched)).ok).toBe(false);
    expect((await service.approveIdentity(a.native, 'demo:bob')).ok).toBe(false);
    expect((await service.approveIdentity(a.native, a.subject)).ok).toBe(true);
  });

  it.each([-300, 120])('recusa evidência com nonce fora da janela (%i)', async offset => {
    const a = await start();
    const envelope = await provider.issue({ ...a.browser, subject: a.subject }, (await clock()) + offset);
    expect((await service.recordIdentity(a.browser, envelope)).ok).toBe(false);
  });

  it('nonce e tentativa não são reutilizados, mesmo com nova confirmação válida do mock', async () => {
    const a = await start();
    expect((await service.recordIdentity(a.browser, a.envelope)).ok).toBe(true);
    expect((await service.recordIdentity(a.browser, a.envelope)).ok).toBe(false);
    const b = await start('demo:bob');
    const nonceHash = await authHash(JSON.parse(a.envelope.payload).nonce as string);
    await expect(db.prepare(`INSERT INTO simulation_assertions (attempt_hash, issuer, subject, nonce_hash, verified_at, issued_at)
      VALUES (?, 'companion-simulation-only', 'demo:bob', ?, unixepoch(), unixepoch())`).bind(await authHash(b.native.state), nonceHash).run()).rejects.toThrow();
    expect(await count('simulation_assertions')).toBe(1);
  });

  it.each(['attempt', 'code', 'cancelled', 'reused'])('recusa resgate %s', async kind => {
    const a = await ready();
    if (kind === 'attempt') await historical('simulation_attempts', await authHash(a.native.state));
    if (kind === 'code') await historical('simulation_grants', await authHash(a.redeem.code));
    if (kind === 'cancelled') expect((await service.cancel(a.native)).ok).toBe(true);
    if (kind === 'reused') expect((await service.redeem(a.redeem)).ok).toBe(true);
    expect((await service.redeem(a.redeem)).ok).toBe(false);
  });

  it.each(['expired', 'cancelled'])('não registra identidade em tentativa %s', async kind => {
    const a = await start();
    if (kind === 'expired') await historical('simulation_attempts', await authHash(a.native.state));
    else await service.cancel(a.native);
    expect((await service.recordIdentity(a.browser, a.envelope)).ok).toBe(false);
    expect((await service.approveIdentity(a.native, a.subject)).ok).toBe(false);
    expect((await service.prepareCode(a.browser)).ok).toBe(false);
  });

  it('cancelamento exige posse e impede aprovação, código e reabertura', async () => {
    const a = await ready();
    expect((await service.cancel({ ...a.native, verifier: randomSimulationSecret() })).ok).toBe(false);
    expect((await service.cancel(a.native)).ok).toBe(true);
    expect((await service.cancel(a.native)).ok).toBe(false);
    await expect(db.prepare('UPDATE simulation_attempts SET cancelled_at = NULL').run()).rejects.toThrow();
    expect((await service.redeem(a.redeem)).ok).toBe(false);
  });

  it('disputa local de dez resgates por instâncias independentes: um único vencedor', async () => {
    const a = await ready();
    const results = await Promise.all(Array.from({ length: 10 }, () => new D1SimulatedProtocol(db, provider).redeem(a.redeem)));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect((await db.prepare('SELECT consumed_at FROM simulation_grants').first())?.consumed_at).not.toBeNull();
    expect((await db.prepare('SELECT finalized_at FROM simulation_attempts').first())?.finalized_at).not.toBeNull();
  });

  it('duas requisições HTTP locais independentes disputam um código: uma única conclusão D1', async () => {
    const a = await ready();
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    // Harness de teste em porta efêmera, ausente do produto; não é uma rota Worker funcional.
    const server = createServer(async (req, res) => {
      if (req.method !== 'POST' || req.url !== '/test-only') { res.writeHead(404).end(); return; }
      req.resume();
      if (++arrived === 2) release();
      await barrier;
      try {
        const result = await new D1SimulatedProtocol(db, provider).redeem(a.redeem);
        res.writeHead(result.ok ? 200 : 403).end();
      } catch { res.writeHead(500).end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test listener unavailable');
      const post = () => new Promise<number>(resolve => {
        const req = request({ host: '127.0.0.1', port: address.port, path: '/test-only', method: 'POST', agent: false }, res => {
          res.resume(); res.on('end', () => resolve(res.statusCode!));
        });
        req.on('error', () => resolve(0)); req.end();
      });
      expect((await Promise.all([post(), post()])).sort()).toEqual([200, 403]);
      expect(arrived).toBe(2);
      expect((await service.redeem(a.redeem)).ok).toBe(false);
    } finally {
      release(); server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it('disputas locais de identidade e emissão de código têm um vencedor cada', async () => {
    const a = await start();
    const records = await Promise.all(Array.from({ length: 4 }, () => new D1SimulatedProtocol(db, provider).recordIdentity(a.browser, a.envelope)));
    expect(records.filter(result => result.ok)).toHaveLength(1);
    await service.approveIdentity(a.native, a.subject);
    const grants = await Promise.all(Array.from({ length: 4 }, () => new D1SimulatedProtocol(db, provider).prepareCode(a.browser)));
    expect(grants.filter(result => result.ok)).toHaveLength(1);
    expect(await count('simulation_grants')).toBe(1);
  });

  it('cancelamento concorrente com resgate: exatamente um efeito terminal', async () => {
    const a = await ready();
    const results = await Promise.all([service.cancel(a.native), new D1SimulatedProtocol(db, provider).redeem(a.redeem)]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    const row = await db.prepare('SELECT cancelled_at, finalized_at FROM simulation_attempts').first();
    expect([row?.cancelled_at, row?.finalized_at].filter(value => value !== null)).toHaveLength(1);
  });

  it.each(['assertion', 'grant', 'completion'])('falha de escrita %s reverte toda a instrução', async stage => {
    const a = await start();
    if (stage === 'assertion') {
      await db.prepare(`CREATE TRIGGER injected_failure AFTER INSERT ON simulation_assertions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`).run();
      expect(await service.recordIdentity(a.browser, a.envelope)).toEqual({ ok: false, error: 'storage-unavailable' });
      expect(await count('simulation_assertions')).toBe(0);
      await db.prepare('DROP TRIGGER injected_failure').run();
    }
    expect((await service.recordIdentity(a.browser, a.envelope)).ok).toBe(true);
    await service.approveIdentity(a.native, a.subject);
    if (stage === 'grant') {
      await db.prepare(`CREATE TRIGGER injected_failure AFTER INSERT ON simulation_grants BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`).run();
      expect(await service.prepareCode(a.browser)).toEqual({ ok: false, error: 'storage-unavailable' });
      expect(await count('simulation_grants')).toBe(0);
      await db.prepare('DROP TRIGGER injected_failure').run();
    }
    const code = await service.prepareCode(a.browser); if (!code.ok) throw new Error('Fixture code failed');
    const redeem = { ...a.native, code: code.code, expectedSubject: a.subject };
    if (stage === 'completion') {
      await db.prepare(`CREATE TRIGGER injected_failure AFTER UPDATE OF finalized_at ON simulation_attempts
        WHEN NEW.finalized_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`).run();
      expect(await service.redeem(redeem)).toEqual({ ok: false, error: 'storage-unavailable' });
      expect((await db.prepare('SELECT consumed_at FROM simulation_grants').first())?.consumed_at).toBeNull();
      expect((await db.prepare('SELECT finalized_at FROM simulation_attempts').first())?.finalized_at).toBeNull();
      await db.prepare('DROP TRIGGER injected_failure').run();
    }
    expect((await service.redeem(redeem)).ok).toBe(true);
  });

  it('erro de resposta depois do commit não produz segundo consumo nem sucesso presumido', async () => {
    const a = await ready();
    const lostResponse = { prepare: (sql: string) => {
      const statement = db.prepare(sql);
      return { bind: (...args: unknown[]) => ({ first: async () => {
        await statement.bind(...args).first(); throw new Error('synthetic lost response');
      } }) };
    } } as unknown as D1Database;
    expect(await new D1SimulatedProtocol(lostResponse, provider).redeem(a.redeem)).toEqual({ ok: false, error: 'storage-unavailable' });
    expect((await service.redeem(a.redeem)).ok).toBe(false);
    expect((await db.prepare('SELECT finalized_at FROM simulation_attempts').first())?.finalized_at).not.toBeNull();
  });

  it('banco indisponível falha fechado e não registra segredos em logs', async () => {
    const a = await ready();
    const broken = new D1SimulatedProtocol({ prepare: () => { throw new Error('synthetic-private-detail'); } } as unknown as D1Database, provider);
    const log = vi.spyOn(console, 'error');
    const results = await Promise.all([broken.begin(await s256(a.native.verifier)), broken.recordIdentity(a.browser, a.envelope),
      broken.approveIdentity(a.native, a.subject), broken.prepareCode(a.browser), broken.redeem(a.redeem), broken.cancel(a.native)]);
    expect(results.every(result => !result.ok && result.error === 'storage-unavailable')).toBe(true);
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain(a.native.verifier);
    expect(JSON.stringify(results)).not.toContain('synthetic-private-detail');
  });

  it('apenas hashes/proveniência fictícia persistem; não expõe verifier, código ou provas no resultado final', async () => {
    const a = await ready(); const result = await service.redeem(a.redeem);
    const dump = JSON.stringify(await Promise.all(['simulation_attempts', 'simulation_assertions', 'simulation_grants'].map(table => db.prepare(`SELECT * FROM ${table}`).all())));
    for (const secret of [a.native.verifier, a.native.state, a.browser.browserBinding, a.browser.csrf, a.redeem.code]) {
      expect(dump).not.toContain(secret); expect(JSON.stringify(result)).not.toContain(secret);
    }
    expect(dump).toContain('companion-simulation-only');
  });

  it.each(['simulation_attempts', 'simulation_assertions', 'simulation_grants'])('DELETE/REPLACE não reabre %s', async table => {
    const a = await ready(); await service.redeem(a.redeem);
    const before = (await db.prepare(`SELECT * FROM ${table}`).all()).results;
    await expect(db.prepare(`DELETE FROM ${table}`).run()).rejects.toThrow();
    await expect(db.prepare(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`).run()).rejects.toThrow();
    expect((await db.prepare(`SELECT * FROM ${table}`).all()).results).toEqual(before);
  });

  it('constraints mantêm FKs, identidade, prazo, aprovação e consumo irreversíveis', async () => {
    const a = await ready();
    for (const sql of [
      "UPDATE simulation_attempts SET challenge_hash = (CASE WHEN substr(challenge_hash, 1, 1) = 'f' THEN 'e' ELSE 'f' END) || substr(challenge_hash, 2)",
      'UPDATE simulation_attempts SET expires_at = expires_at + 1',
      "UPDATE simulation_attempts SET approved_subject = 'demo:bob'",
      "UPDATE simulation_assertions SET subject = 'demo:bob'",
      'UPDATE simulation_grants SET expires_at = expires_at + 1',
      'UPDATE simulation_attempts SET finalized_at = unixepoch()',
    ]) await expect(db.prepare(sql).run()).rejects.toThrow();
    expect((await service.redeem(a.redeem)).ok).toBe(true);
    await expect(db.prepare('UPDATE simulation_grants SET consumed_at = NULL').run()).rejects.toThrow();
    await expect(db.prepare('UPDATE simulation_attempts SET finalized_at = NULL').run()).rejects.toThrow();
    expect((await db.prepare('PRAGMA quick_check').first())?.quick_check).toBe('ok');
    expect((await db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });

  it('FK e namespace impedem vincular grant a tentativa sem identidade ou sujeito Steam', async () => {
    const a = await start();
    await expect(db.prepare(`INSERT INTO simulation_grants (code_hash, attempt_hash, created_at, expires_at)
      VALUES (?, ?, unixepoch(), unixepoch() + 60)`).bind('a'.repeat(64), await authHash(a.native.state)).run()).rejects.toThrow();
    await expect(provider.issue({ ...a.browser, subject: '10000000000000000' as SimulatedSubject })).rejects.toThrow();
    await expect(db.prepare(`INSERT INTO simulation_assertions (attempt_hash, issuer, subject, nonce_hash, verified_at, issued_at)
      VALUES (?, 'companion-simulation-only', '10000000000000000', ?, unixepoch(), unixepoch())`)
      .bind(await authHash(a.native.state), 'b'.repeat(64)).run()).rejects.toThrow();
    expect(await count('simulation_assertions')).toBe(0);
  });

  it.each(['challenge_hash', 'browser_hash', 'csrf_hash', 'state_hash'])('recusa hash %s com NUL e conserva tentativa', async column => {
    const a = await start(); const hash = await authHash(a.native.state);
    await expect(db.prepare(`INSERT INTO simulation_attempts (state_hash, challenge_hash, browser_hash, csrf_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, unixepoch(), unixepoch() + 300)`).bind(...['state_hash', 'challenge_hash', 'browser_hash', 'csrf_hash']
      .map(name => name === column ? 'a'.repeat(32) + '\0' + 'a'.repeat(31) : name === 'state_hash' ? hash : 'a'.repeat(64))).run()).rejects.toThrow();
    expect(await count('simulation_attempts')).toBe(1);
  });

  it('simulação concluída não autoriza rotas públicas nem proveniência de sessão', async () => {
    const a = await ready(); await service.redeem(a.redeem);
    for (const value of [a.native.state, a.redeem.code, a.native.verifier]) {
      expect((await inspectSessionProvenance(db, await authHash(value), 'desktop')).ok).toBe(false);
      for (const path of ['/auth/login', '/auth/callback', '/auth/desktop/redeem', '/api/library']) {
        const response = await app.request(path, { method: 'POST', headers: { Authorization: `Bearer ${value}` } }, proxy.env);
        expect(response.status).toBe(path.startsWith('/auth') ? 501 : 401);
        expect(response.headers.has('Set-Cookie')).toBe(false);
        expect(response.headers.has('Location')).toBe(false);
      }
    }
  });

  it('expõe o limite de relay do modelo: encaminhar contexto e aprovar a conta alheia ainda conclui somente a simulação', async () => {
    const attacker = await start();
    // Vítima recebe todas as provas do contexto de A e escolhe Bob no mock.
    // A mantém seu próprio verifier. Não há prova criptográfica de intenção humana/destino.
    const relayed = await provider.issue({ ...attacker.browser, subject: 'demo:bob' }, await clock());
    expect((await service.recordIdentity(attacker.browser, relayed)).ok).toBe(true);
    expect((await service.approveIdentity(attacker.native, 'demo:bob')).ok).toBe(true);
    const grant = await service.prepareCode(attacker.browser); if (!grant.ok) throw new Error('Fixture code failed');
    expect(await service.redeem({ ...attacker.native, code: grant.code, expectedSubject: 'demo:bob' }))
      .toEqual({ ok: true, stage: 'simulation-completed-no-session', subject: 'demo:bob' });
    expect(await count('sessions')).toBe(0);
    expect((await app.request('/api/library', {}, proxy.env)).status).toBe(401);
  });

  it('módulos simulados não entram no grafo estático do Worker', () => {
    const visited = new Set<string>();
    function visit(file: string) {
      const path = resolve(file); if (visited.has(path)) return;
      visited.add(path);
      expect(path).not.toContain(`${resolve('backend/src/simulation')}`);
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/(?:from\s*|import\s*\()['"]([.][^'"]+)['"]/g)) {
        visit(resolve(path, '..', match[1]) + '.ts');
      }
    }
    visit('backend/src/index.ts');
  });
});
