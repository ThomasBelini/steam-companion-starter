import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPENID_NAMESPACE, STEAM_OPENID_ENDPOINT, type OpenIdCallback, type OpenIdDependencies } from '../steam/OpenIdContracts';
import { SteamOpenIdVerifier } from '../steam/SteamOpenIdVerifier.server';

const now = Date.parse('2026-10-26T18:00:00Z');
const steamId = '10000000000000000'; // Identidade sintética; nunca consultar uma conta real.
const claimedId = `https://steamcommunity.com/openid/id/${steamId}`;
const context = { expectedReturnTo: 'https://companion.example/auth/callback?state=local-test', realm: 'https://companion.example/' };
const signedFields = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];
const signature = btoa('s'.repeat(32)); // Formato sintético, sem assinatura Steam real.

function fields() {
  return new URLSearchParams({
    'openid.ns': OPENID_NAMESPACE, 'openid.mode': 'id_res', 'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': claimedId, 'openid.identity': claimedId, 'openid.return_to': context.expectedReturnTo,
    'openid.response_nonce': '2026-10-26T18:00:00Ztest-only-nonce', 'openid.assoc_handle': 'test-only-handle',
    'openid.signed': signedFields.join(','), 'openid.sig': signature,
  });
}
function callback(params = fields()): OpenIdCallback {
  return { method: 'GET', ...context, callbackUrl: `${context.expectedReturnTo}&${params.toString()}` };
}
function provider(body = `ns:${OPENID_NAMESPACE}\nis_valid:true\n`, init?: ResponseInit) {
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, ...init });
}
function harness() {
  const fetcher = vi.fn<OpenIdDependencies['fetcher']>().mockImplementation(async () => provider());
  const discoverIdentity = vi.fn<OpenIdDependencies['discoverIdentity']>().mockImplementation(async id => ({
    claimedId: id, identity: id, opEndpoint: STEAM_OPENID_ENDPOINT, namespace: OPENID_NAMESPACE,
  }));
  const lookupNonce = vi.fn<OpenIdDependencies['lookupNonce']>().mockResolvedValue('unseen');
  const options = { fetcher, discoverIdentity, lookupNonce, now: () => now, timeoutMs: 8000 };
  return { fetcher, discoverIdentity, lookupNonce, options, verifier: new SteamOpenIdVerifier(options) };
}

beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in tests')); });
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('verificação OpenID isolada, sem rede real ou sessão', () => {
  it.each(['https', 'http'])('preserva claimed_id %s sem normalização', async scheme => {
    const h = harness();
    const params = fields();
    const identity = claimedId.replace('https:', `${scheme}:`);
    params.set('openid.claimed_id', identity); params.set('openid.identity', identity);
    const result = await h.verifier.verify(callback(params));
    expect(result).toMatchObject({ ok: true, stage: 'assertion-verified-pending-atomic-commit', assertion: {
      steamId, claimedId: identity, returnTo: context.expectedReturnTo, nonceIssuedAt: now / 1000,
      retainNonceUntil: now / 1000 + 600,
    } });
    if (result.ok) expect(result.assertion.nonceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.discoverIdentity).toHaveBeenCalledWith(identity, expect.any(AbortSignal));
    const [url, init] = h.fetcher.mock.calls[0];
    expect(url).toBe(STEAM_OPENID_ENDPOINT);
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
    expect(new Headers(init.headers).has('Cookie')).toBe(false);
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    const posted = new URLSearchParams(String(init.body));
    expect(posted.get('openid.claimed_id')).toBe(identity);
    expect(posted.get('openid.mode')).toBe('check_authentication');
    expect(posted.has('state')).toBe(false);
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('session');
  });

  it('encaminha todos os valores OpenID, alterando somente mode, e não exige signed autorreferente', async () => {
    const h = harness();
    const params = fields();
    params.set('openid.ns.extra', 'https://example.invalid/extension');
    params.set('openid.extra.data', 'literal+%2F=value');
    params.set('openid.invalidate_handle', 'old-test-handle');
    expect(params.get('openid.signed')!.split(',')).not.toContain('signed');
    expect((await h.verifier.verify(callback(params))).ok).toBe(true);
    const posted = new URLSearchParams(String(h.fetcher.mock.calls[0][1].body));
    for (const [key, value] of params) expect(posted.get(key)).toBe(key === 'openid.mode' ? 'check_authentication' : value);
  });

  it.each(signedFields)('is_valid:true simulado não substitui campo assinado obrigatório: %s', async missing => {
    const h = harness();
    const params = fields();
    params.set('openid.signed', signedFields.filter(field => field !== missing).join(','));
    expect(await h.verifier.verify(callback(params))).toEqual({ ok: false, error: 'invalid-assertion' });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.discoverIdentity).not.toHaveBeenCalled();
  });

  it.each(['ns', 'mode', 'signed', 'sig', ...signedFields])('rejeita parâmetro obrigatório ausente: %s', async key => {
    const h = harness(); const params = fields(); params.delete(`openid.${key}`);
    expect((await h.verifier.verify(callback(params))).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['ns', 'http://openid.net/signon/1.1'], ['mode', 'cancel'], ['mode', 'check_authentication'],
    ['op_endpoint', 'http://steamcommunity.com/openid/login'],
    ['op_endpoint', 'https://steamcommunity.com.evil.invalid/openid/login'],
    ['op_endpoint', 'https://steamcommunity.com/openid/'],
    ['return_to', `${context.expectedReturnTo}&next=https://evil.invalid`],
    ['return_to', 'https://evil.invalid/auth/callback?state=local-test'],
    ['identity', claimedId.replace(steamId, '20000000000000000')],
    ['identity', claimedId.replace('https:', 'http:')], ['sig', 'malformed'],
    ['sig', ` ${signature}`], ['assoc_handle', 'contains space'], ['assoc_handle', 'x'.repeat(256)],
    ['signed', `${signedFields.join(',')},identity`], ['signed', `${signedFields.join(',')},missing`],
    ['signed', `${signedFields.join(',')}, bad`], ['signed', `${signedFields.join(',')},`],
  ])('rejeita campo adulterado/malformado %s=%s', async (key, value) => {
    const h = harness(); const params = fields(); params.set(`openid.${key}`, value);
    expect((await h.verifier.verify(callback(params))).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    'https://steamcommunity.com.evil.invalid/openid/id/10000000000000000',
    'https://steamcommunity.com@evil.invalid/openid/id/10000000000000000',
    'https://steamcommunity.com:443/openid/id/10000000000000000',
    'https://STEAMCOMMUNITY.COM/openid/id/10000000000000000',
    `${claimedId}/extra`, `${claimedId}?x=1`, `${claimedId}#fragment`,
    claimedId.replace('/id/', '/id%2F'), claimedId.replace(steamId, '18446744073709551616'),
    claimedId.replace(steamId, '01000000000000000'),
  ])('rejeita identidade não canônica: %s', async identity => {
    const h = harness(); const params = fields();
    params.set('openid.claimed_id', identity); params.set('openid.identity', identity);
    expect((await h.verifier.verify(callback(params))).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('alteração de ambos os IDs é rejeitada quando o OP simulado invalida a assinatura', async () => {
    const h = harness(); const params = fields();
    const changed = claimedId.replace(steamId, '20000000000000000');
    params.set('openid.claimed_id', changed); params.set('openid.identity', changed);
    h.fetcher.mockResolvedValue(provider(`ns:${OPENID_NAMESPACE}\nis_valid:false\n`));
    expect(await h.verifier.verify(callback(params))).toEqual({ ok: false, error: 'provider-rejected' });
  });

  it('não aceita POST nem combina parâmetros de query/corpo', async () => {
    const h = harness();
    expect(await h.verifier.verify({ ...callback(), method: 'POST' } as unknown as OpenIdCallback))
      .toEqual({ ok: false, error: 'invalid-context' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it.each(['&openid.ns=x', '&%6fpenid.ns=x', '&state=local-test', '&a=b', '&bad=%ZZ', '&bad=%C0%AF', '&bad=%00'])('rejeita parâmetros duplicados/ambíguos: %s', async extra => {
    const h = harness(); const input = callback();
    expect((await h.verifier.verify({ ...input, callbackUrl: input.callbackUrl + extra })).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it.each(['%2500', '%250A', '%252F'])('não decodifica identidade duas vezes: %s', async encoded => {
    const h = harness(); const input = callback();
    expect((await h.verifier.verify({ ...input, callbackUrl: input.callbackUrl.replace(steamId, steamId + encoded) })).ok).toBe(false);
  });

  it.each(['field', 'count', 'total'])('rejeita excesso de %s antes do transporte', async kind => {
    const h = harness(); const params = fields();
    if (kind === 'field') params.set('openid.extra', 'x'.repeat(4097));
    if (kind === 'count') for (let i = 0; i < 33; i++) params.set(`openid.x${i}`, 'x');
    if (kind === 'total') for (let i = 0; i < 8; i++) params.set(`openid.x${i}`, 'x'.repeat(3000));
    expect((await h.verifier.verify(callback(params))).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { callbackUrl: callback().callbackUrl.replace('companion.example', 'evil.invalid') },
    { callbackUrl: callback().callbackUrl.replace('/auth/callback?', '/auth/other?') },
    { callbackUrl: callback().callbackUrl.replace('state=local-test&', 'state=wrong&') },
    { callbackUrl: callback().callbackUrl + '#fragment' },
    { expectedReturnTo: 'https://companion.example/auth/callback?openid.mode=id_res' },
    { expectedReturnTo: 'http://companion.example/auth/callback' },
    { realm: 'https://evil.invalid/' }, { realm: 'https://companion.example/private/' },
    { realm: 'https://user:password@companion.example/' },
  ])('rejeita contexto de retorno/realm incorreto: %j', async overrides => {
    const h = harness();
    expect((await h.verifier.verify({ ...callback(), ...overrides })).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
  });
});

describe('nonce, descoberta e fronteira de replay atômico', () => {
  it.each([
    '2026-10-26T17:55:00Zold', '2026-10-26T18:01:01Zfuture', '2026-02-30T18:00:00Zbad-date',
    '2026-10-26T18:00:00.000Zfractional', '2026-10-26T18:00:00+00:00offset',
    '2026-10-26T18:00:00Zwith space', `2026-10-26T18:00:00Z${'x'.repeat(236)}`, '',
  ])('rejeita nonce inválido/expirado: %s', async nonce => {
    const h = harness(); const params = fields(); params.set('openid.response_nonce', nonce);
    expect((await h.verifier.verify(callback(params))).ok).toBe(false);
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it.each(['2026-10-26T17:55:01Zwithin', '2026-10-26T18:01:00Zedge', '2026-10-26T18:00:00Z'])('aceita janela/sintaxe permitida: %s', async nonce => {
    const h = harness(); const params = fields(); params.set('openid.response_nonce', nonce);
    expect((await h.verifier.verify(callback(params))).ok).toBe(true);
  });

  it('reconfere frescor depois do transporte', async () => {
    const h = harness();
    const clock = vi.fn().mockReturnValueOnce(now).mockReturnValue(now + 300000);
    expect(await new SteamOpenIdVerifier({ ...h.options, now: clock }).verify(callback())).toEqual({ ok: false, error: 'invalid-nonce' });
  });

  it('nega nonce já registrado e não efetua consulta ao provedor', async () => {
    const h = harness(); h.lookupNonce.mockResolvedValue('seen');
    expect(await h.verifier.verify(callback())).toEqual({ ok: false, error: 'replay' });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.lookupNonce).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/), expect.any(AbortSignal));
  });

  it('nega resposta ambígua ou indisponibilidade do repositório de nonces', async () => {
    const h = harness(); h.lookupNonce.mockResolvedValue(undefined as never);
    expect((await h.verifier.verify(callback())).ok).toBe(false);
    h.lookupNonce.mockRejectedValue(new Error('test-only-private-database-error'));
    expect(await h.verifier.verify(callback())).toEqual({ ok: false, error: 'unavailable' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('duas consultas de replay não consomem nonce: ambas continuam pendentes, sem autorizar sessão', async () => {
    const h = harness();
    const results = await Promise.all([h.verifier.verify(callback()), h.verifier.verify(callback())]);
    for (const result of results) expect(result).toMatchObject({ ok: true, stage: 'assertion-verified-pending-atomic-commit' });
    h.lookupNonce.mockResolvedValue('seen'); // Simula o registro feito pelo futuro commit D1.
    expect(await h.verifier.verify(callback())).toEqual({ ok: false, error: 'replay' });
  });

  it.each(['claimedId', 'identity', 'opEndpoint', 'namespace', 'missing'])('nega descoberta divergente/ausente: %s', async key => {
    const h = harness();
    h.discoverIdentity.mockResolvedValue(key === 'missing' ? null : {
      claimedId, identity: claimedId, opEndpoint: STEAM_OPENID_ENDPOINT, namespace: OPENID_NAMESPACE, [key]: 'https://evil.invalid/',
    });
    expect(await h.verifier.verify(callback())).toEqual({ ok: false, error: 'discovery-failed' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });

  it('não equipara identificadores HTTP/HTTPS na descoberta', async () => {
    const h = harness();
    h.discoverIdentity.mockResolvedValue({ claimedId: claimedId.replace('https:', 'http:'), identity: claimedId,
      opEndpoint: STEAM_OPENID_ENDPOINT, namespace: OPENID_NAMESPACE });
    expect((await h.verifier.verify(callback())).ok).toBe(false);
  });
});

describe('transporte e resposta check_authentication', () => {
  it.each([
    'is_valid:true\n', `ns:${OPENID_NAMESPACE}\n`, `ns:${OPENID_NAMESPACE}\nis_valid:TRUE\n`,
    `ns:${OPENID_NAMESPACE}\nis_valid:true\nis_valid:false\n`, `ns:${OPENID_NAMESPACE}\nis_valid: true\n`,
    `ns:${OPENID_NAMESPACE}\nis_valid:true`, `ns:${OPENID_NAMESPACE}\r\nis_valid:true\r\n`,
    `ns:${OPENID_NAMESPACE}\nis_valid:true\nerror:ambiguous\n`, 'ns:wrong\nis_valid:true\n',
    '{"is_valid":true}', `\ufeffns:${OPENID_NAMESPACE}\nis_valid:true\n`,
  ])('nega resposta malformada/ambígua: %s', async body => {
    const h = harness(); h.fetcher.mockResolvedValue(provider(body));
    expect((await h.verifier.verify(callback())).ok).toBe(false);
  });

  it('aceita invalidate_handle opcional sem manter associações', async () => {
    const h = harness(); h.fetcher.mockResolvedValue(provider(`ns:${OPENID_NAMESPACE}\nis_valid:true\ninvalidate_handle:old-handle\n`));
    expect((await h.verifier.verify(callback())).ok).toBe(true);
  });

  it.each([302, 400, 429, 500])('nega HTTP %s mesmo com is_valid:true', async status => {
    const h = harness(); h.fetcher.mockResolvedValue(provider(undefined, { status }));
    expect((await h.verifier.verify(callback())).ok).toBe(false);
  });

  it.each(['application/json', 'text/html', 'text/plain; charset=iso-8859-1'])('nega tipo de resposta %s', async type => {
    const h = harness(); h.fetcher.mockResolvedValue(provider(undefined, { headers: { 'Content-Type': type } }));
    expect((await h.verifier.verify(callback())).ok).toBe(false);
  });

  it('nega redirect já seguido ou URL final divergente, mesmo se o mock ignorar redirect:error', async () => {
    const h = harness(); const response = provider();
    Object.defineProperty(response, 'redirected', { value: true });
    h.fetcher.mockResolvedValueOnce(response);
    expect((await h.verifier.verify(callback())).ok).toBe(false);
    const other = provider(); Object.defineProperty(other, 'url', { value: 'https://evil.invalid/' });
    h.fetcher.mockResolvedValueOnce(other);
    expect((await h.verifier.verify(callback())).ok).toBe(false);
  });

  it('limita Content-Length declarado e bytes efetivamente recebidos', async () => {
    const h = harness();
    h.fetcher.mockResolvedValueOnce(provider(undefined, { headers: { 'Content-Length': '16385' } }));
    expect((await h.verifier.verify(callback())).ok).toBe(false);
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`ns:${OPENID_NAMESPACE}\n`));
      controller.enqueue(new Uint8Array(16384));
    }, cancel });
    h.fetcher.mockResolvedValueOnce(new Response(body, { headers: { 'Content-Length': '1' } }));
    expect((await h.verifier.verify(callback())).ok).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  it.each(['1', '16000', '-1', 'not-a-number', '1e3'])('nega comprimento inconsistente/malformado: %s', async length => {
    const h = harness();
    h.fetcher.mockResolvedValue(provider(undefined, { headers: { 'Content-Length': length } }));
    expect((await h.verifier.verify(callback())).ok).toBe(false);
  });

  it('aceita stream completo em chunks com Content-Length exato e Content-Type ausente', async () => {
    const h = harness();
    const bytes = new TextEncoder().encode(`ns:${OPENID_NAMESPACE}\nis_valid:true\n`);
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(bytes.slice(0, 3)); controller.enqueue(bytes.slice(3)); controller.close();
    } });
    h.fetcher.mockResolvedValue(new Response(body, { headers: { 'Content-Length': String(bytes.length) } }));
    expect((await h.verifier.verify(callback())).ok).toBe(true);
  });

  it('nega UTF-8 inválido e falha do stream sem eco de exceção', async () => {
    const h = harness();
    h.fetcher.mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xfe])));
    expect((await h.verifier.verify(callback())).ok).toBe(false);
    h.fetcher.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.error(new Error('test-only-private-error')); } })));
    expect(await h.verifier.verify(callback())).toEqual({ ok: false, error: 'unavailable' });
  });

  it('sanitiza falha de rede e de descoberta sem registrar detalhes', async () => {
    const h = harness(); const log = vi.spyOn(console, 'error');
    h.fetcher.mockRejectedValue(new Error('test-only-private-network-error'));
    expect(await h.verifier.verify(callback())).toEqual({ ok: false, error: 'unavailable' });
    h.discoverIdentity.mockRejectedValue(new Error('test-only-private-discovery-error'));
    expect(await h.verifier.verify(callback())).toEqual({ ok: false, error: 'unavailable' });
    expect(log).not.toHaveBeenCalled();
  });

  it.each(['fetch', 'discovery', 'replay', 'body'])('timeout total encerra dependência travada: %s', async phase => {
    const h = harness();
    const never = () => new Promise<never>(() => {});
    const cancel = vi.fn();
    if (phase === 'fetch') h.fetcher.mockImplementation(never);
    if (phase === 'discovery') h.discoverIdentity.mockImplementation(never);
    if (phase === 'replay') h.lookupNonce.mockImplementation(never);
    if (phase === 'body') h.fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel })));
    expect(await new SteamOpenIdVerifier({ ...h.options, timeoutMs: 100 }).verify(callback())).toEqual({ ok: false, error: 'timeout' });
    if (phase === 'body') expect(cancel).toHaveBeenCalled();
    if (h.fetcher.mock.calls.length) expect(h.fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  });

  it('não fornece defaults permissivos de transporte/descoberta/replay', () => {
    const h = harness();
    for (const key of ['fetcher', 'discoverIdentity', 'lookupNonce']) {
      expect(() => new SteamOpenIdVerifier({ ...h.options, [key]: undefined } as unknown as OpenIdDependencies)).toThrow('Configuração OpenID inválida');
    }
    for (const timeoutMs of [0, -1, 8001, NaN]) expect(() => new SteamOpenIdVerifier({ ...h.options, timeoutMs })).toThrow();
  });
});
