import { validSteamId } from '../../src/steam/contracts';
import { OPENID_NAMESPACE, STEAM_OPENID_ENDPOINT, type OpenIdCallback, type OpenIdFailureCode } from './OpenIdContracts';

export const MAX_BODY_BYTES = 16384;
const encoder = new TextEncoder();
const requiredSigned = ['op_endpoint', 'return_to', 'response_nonce', 'assoc_handle', 'claimed_id', 'identity'];
function hasControls(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

export class OpenIdFailure extends Error {
  constructor(readonly code: OpenIdFailureCode) { super(code); }
}
export function requireValid(condition: unknown, code: OpenIdFailureCode): asserts condition {
  if (!condition) throw new OpenIdFailure(code);
}

function form(raw: string): Map<string, string> {
  requireValid(raw.length <= MAX_BODY_BYTES && encoder.encode(raw).length <= MAX_BODY_BYTES, 'invalid-assertion');
  const pairs = raw.split('&');
  requireValid(pairs.length <= 32, 'invalid-assertion');
  const result = new Map<string, string>();
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    requireValid(index > 0, 'invalid-assertion');
    let key: string, value: string;
    try {
      key = decodeURIComponent(pair.slice(0, index).replace(/\+/g, ' '));
      value = decodeURIComponent(pair.slice(index + 1).replace(/\+/g, ' '));
    } catch { throw new OpenIdFailure('invalid-assertion'); }
    requireValid(/^[A-Za-z0-9_.-]{1,128}$/.test(key) && !result.has(key)
      && !hasControls(value) && encoder.encode(value).length <= 4096, 'invalid-assertion');
    result.set(key, value);
  }
  return result;
}

function httpsUrl(raw: string): URL {
  requireValid(typeof raw === 'string' && raw.length <= MAX_BODY_BYTES + 2048 && !/[\s\\]/u.test(raw), 'invalid-context');
  let url: URL;
  try { url = new URL(raw); } catch { throw new OpenIdFailure('invalid-context'); }
  requireValid(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port
    && url.href === raw, 'invalid-context');
  return url;
}

export function validateNonce(nonce: string, now: number): number {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)[\x21-\x7e]*$/.exec(nonce);
  requireValid(match && nonce.length <= 255 && Number.isSafeInteger(now) && now >= 0, 'invalid-nonce');
  const timestamp = Date.parse(match[1]);
  requireValid(Number.isFinite(timestamp) && new Date(timestamp).toISOString().replace('.000Z', 'Z') === match[1]
    && now - timestamp < 300000 && timestamp - now <= 60000, 'invalid-nonce');
  return timestamp / 1000;
}

export function validateCallback(input: OpenIdCallback, now: number) {
  requireValid(input.method === 'GET', 'invalid-context');
  const actual = httpsUrl(input.callbackUrl);
  const expected = httpsUrl(input.expectedReturnTo);
  const realm = httpsUrl(input.realm);
  requireValid(realm.pathname === '/' && !realm.search && realm.origin === expected.origin
    && actual.origin === expected.origin && actual.pathname === expected.pathname, 'invalid-context');
  const fields = form(actual.search.slice(1));
  const returnFields = expected.search ? form(expected.search.slice(1)) : new Map<string, string>();
  for (const [key, value] of returnFields) {
    requireValid(!key.startsWith('openid.') && fields.get(key) === value, 'invalid-context');
  }
  for (const key of fields.keys()) {
    requireValid(key.startsWith('openid.') ? /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(key.slice(7))
      : returnFields.has(key), 'invalid-assertion');
  }
  const get = (key: string) => fields.get(`openid.${key}`);
  for (const key of ['ns', 'mode', 'sig', 'signed', ...requiredSigned]) requireValid(get(key), 'invalid-assertion');
  requireValid(get('ns') === OPENID_NAMESPACE && get('mode') === 'id_res'
    && get('op_endpoint') === STEAM_OPENID_ENDPOINT && get('return_to') === input.expectedReturnTo, 'invalid-assertion');
  const claimedId = get('claimed_id')!;
  const identityMatch = /^https?:\/\/steamcommunity\.com\/openid\/id\/([1-9][0-9]{16,19})$/.exec(claimedId);
  requireValid(identityMatch && validSteamId(identityMatch[1]) && claimedId === get('identity'), 'invalid-assertion');
  for (const key of ['assoc_handle', 'invalidate_handle']) {
    const value = get(key);
    if (value !== undefined) requireValid(/^[\x21-\x7e]{1,255}$/.test(value), 'invalid-assertion');
  }
  const signed = get('signed')!.split(',');
  requireValid(signed.length <= 32 && new Set(signed).size === signed.length
    && signed.every(key => /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(key) && get(key) !== undefined)
    && requiredSigned.every(key => signed.includes(key)), 'invalid-assertion');
  // A lista usual não inclui "signed"; não exigir autorreferência.
  const signature = get('sig')!;
  try {
    const decoded = atob(signature);
    requireValid((decoded.length === 20 || decoded.length === 32) && btoa(decoded) === signature, 'invalid-assertion');
  } catch { throw new OpenIdFailure('invalid-assertion'); }
  const nonce = get('response_nonce')!;
  const nonceIssuedAt = validateNonce(nonce, now);
  return { fields, steamId: identityMatch[1], claimedId, nonce, nonceIssuedAt, returnTo: input.expectedReturnTo };
}

export async function boundedResponse(response: Response, signal: AbortSignal): Promise<string> {
  const type = response.headers.get('Content-Type');
  const size = response.headers.get('Content-Length');
  requireValid(response.status === 200 && !response.redirected
    && (!response.url || response.url === STEAM_OPENID_ENDPOINT)
    && (!type || /^text\/plain(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(type)), 'invalid-provider-response');
  requireValid(size === null || (/^\d+$/.test(size) && Number(size) <= MAX_BODY_BYTES), 'invalid-provider-response');
  requireValid(response.body, 'invalid-provider-response');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      requireValid(!signal.aborted, 'timeout');
      const chunk = await reader.read();
      requireValid(!signal.aborted, 'timeout');
      if (chunk.done) break;
      total += chunk.value.byteLength;
      requireValid(total <= MAX_BODY_BYTES, 'invalid-provider-response');
      chunks.push(chunk.value);
    }
    requireValid(size === null || total === Number(size), 'invalid-provider-response');
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new OpenIdFailure('invalid-provider-response'); }
  } finally {
    cancel();
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function validateProviderResponse(body: string): void {
  requireValid(body.endsWith('\n'), 'invalid-provider-response');
  const lines = body.slice(0, -1).split('\n');
  requireValid(lines.length <= 3, 'invalid-provider-response');
  const fields = new Map<string, string>();
  for (const line of lines) {
    const index = line.indexOf(':');
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    requireValid(index > 0 && ['ns', 'is_valid', 'invalidate_handle'].includes(key) && !fields.has(key)
      && value.length > 0 && !hasControls(value), 'invalid-provider-response');
    fields.set(key, value);
  }
  requireValid(fields.get('ns') === OPENID_NAMESPACE
    && ['true', 'false'].includes(fields.get('is_valid') ?? '')
    && (!fields.has('invalidate_handle') || /^[\x21-\x7e]{1,255}$/.test(fields.get('invalidate_handle')!)), 'invalid-provider-response');
  requireValid(fields.get('is_valid') === 'true', 'provider-rejected');
}
