import { authHash } from '../auth/D1OpenIdPreparation.server';

if ('window' in globalThis) throw new Error('Laboratório exclusivo do servidor.');

export const simulatedSubjects = ['demo:alice', 'demo:bob'] as const;
export type SimulatedSubject = typeof simulatedSubjects[number];
export const isSubject = (value: unknown): value is SimulatedSubject => simulatedSubjects.some(subject => subject === value);
export const isHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export function randomSimulationSecret(): string { return encode(crypto.getRandomValues(new Uint8Array(32))); }
export function canonicalSecret(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  return encode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0))) === value;
}
// O desafio Rust é base64url dos mesmos 32 bytes, não SHA256(SHA256(verifier)).
export function challengeHex(challenge: string): string | null {
  if (!canonicalSecret(challenge)) return null;
  return Array.from(atob(challenge.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

type Evidence = {
  issuer: 'companion-simulation-only'; subject: SimulatedSubject;
  attemptHash: string; browserHash: string; csrfHash: string; nonce: string; issuedAt: number;
};
export type SimulatedEnvelope = Readonly<{ payload: string; signature: string }>;

// Autoridade local explícita, sem conta Steam, chave persistente ou fallback OpenID.
// HMAC só permite testar adulteração/proveniência do mock; NÃO atesta identidade real.
export class SimulatedIdentityProvider {
  readonly #key: CryptoKey;
  private constructor(key: CryptoKey) { this.#key = key; }
  static async create() {
    const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    if (!('algorithm' in key)) throw new Error('Invalid simulation key');
    return new SimulatedIdentityProvider(key);
  }
  async issue(input: { subject: SimulatedSubject; state: string; browserBinding: string; csrf: string }, issuedAt = Math.floor(Date.now() / 1000)): Promise<SimulatedEnvelope> {
    if (!isSubject(input.subject) || ![input.state, input.browserBinding, input.csrf].every(canonicalSecret)
      || !Number.isSafeInteger(issuedAt) || issuedAt < 0) throw new Error('Invalid simulated evidence');
    const evidence: Evidence = { issuer: 'companion-simulation-only', subject: input.subject,
      attemptHash: await authHash(input.state), browserHash: await authHash(input.browserBinding), csrfHash: await authHash(input.csrf),
      nonce: randomSimulationSecret(), issuedAt };
    const payload = JSON.stringify(evidence);
    return { payload, signature: encode(new Uint8Array(await crypto.subtle.sign('HMAC', this.#key, new TextEncoder().encode(payload)))) };
  }
  async verify(envelope: SimulatedEnvelope): Promise<Evidence | null> {
    try {
      if (!envelope) return null;
      const { payload, signature: encodedSignature } = envelope;
      if (typeof payload !== 'string' || payload.length > 1024 || !canonicalSecret(encodedSignature)) return null;
      const signature = Uint8Array.from(atob(encodedSignature.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0));
      if (!await crypto.subtle.verify('HMAC', this.#key, signature, new TextEncoder().encode(payload))) return null;
      const data = JSON.parse(payload) as Evidence;
      if (Object.keys(data).sort().join(',') !== 'attemptHash,browserHash,csrfHash,issuedAt,issuer,nonce,subject'
        || data.issuer !== 'companion-simulation-only' || !isSubject(data.subject) || !canonicalSecret(data.nonce)
        || ![data.attemptHash, data.browserHash, data.csrfHash].every(isHash) || !Number.isSafeInteger(data.issuedAt) || data.issuedAt < 0) return null;
      return data;
    } catch { return null; }
  }
}
