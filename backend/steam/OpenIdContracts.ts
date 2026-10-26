export const OPENID_NAMESPACE = 'http://specs.openid.net/auth/2.0';
export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

export type OpenIdCallback = Readonly<{
  method: 'GET'; // Perfil desta etapa: não mesclar query e corpo de POST.
  callbackUrl: string;
  // Valores do contexto confiável da tentativa, nunca derivados de headers/query do cliente.
  expectedReturnTo: string;
  realm: string;
}>;

export type DiscoveredIdentity = Readonly<{
  claimedId: string;
  identity: string;
  opEndpoint: string;
  namespace: string;
}>;

export type OpenIdDependencies = Readonly<{
  // Sem defaults de rede, descoberta ou armazenamento permissivos.
  fetcher: (url: string, init: RequestInit) => Promise<Response>;
  discoverIdentity: (claimedId: string, signal: AbortSignal) => Promise<DiscoveredIdentity | null>;
  lookupNonce: (hash: string, signal: AbortSignal) => Promise<'seen' | 'unseen'>;
  now?: () => number; // Milissegundos Unix do servidor.
  timeoutMs?: number; // Prazo total, incluindo dependências e leitura do corpo; máximo 8 s.
}>;

export type OpenIdFailureCode = 'invalid-context' | 'invalid-assertion' | 'invalid-nonce'
  | 'discovery-failed' | 'replay' | 'replay-check-failed' | 'provider-rejected'
  | 'invalid-provider-response' | 'unavailable' | 'timeout';

export type OpenIdVerificationResult =
  | { ok: false; error: OpenIdFailureCode }
  | { ok: true; stage: 'assertion-verified-pending-atomic-commit'; assertion: Readonly<{
    steamId: string;
    claimedId: string;
    opEndpoint: typeof STEAM_OPENID_ENDPOINT;
    returnTo: string;
    nonceHash: string;
    nonceIssuedAt: number;
    retainNonceUntil: number;
  }> };
