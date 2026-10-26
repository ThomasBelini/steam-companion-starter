-- Estrutura preparatória. Nenhuma rota atual cria ou aceita sessões/códigos.
-- Todos os tempos abaixo são segundos Unix UTC, não strings/datas locais.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  client_kind TEXT NOT NULL CHECK (client_kind IN ('web', 'desktop')),
  csrf_token_hash TEXT CHECK (csrf_token_hash IS NULL OR
    (length(csrf_token_hash) = 64 AND csrf_token_hash NOT GLOB '*[^0-9a-f]*')),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer'
    AND expires_at > created_at AND expires_at <= created_at + 3600),
  last_seen_at INTEGER NOT NULL CHECK (typeof(last_seen_at) = 'integer'
    AND last_seen_at >= created_at AND last_seen_at < expires_at),
  revoked_at INTEGER CHECK (revoked_at IS NULL OR
    (typeof(revoked_at) = 'integer' AND revoked_at >= created_at)),
  CHECK (client_kind <> 'web' OR csrf_token_hash IS NOT NULL)
);
CREATE INDEX sessions_by_user ON sessions(steam_id);
CREATE INDEX sessions_by_expiry ON sessions(expires_at);

CREATE TABLE auth_attempts (
  state_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(state_hash) = 64 AND state_hash NOT GLOB '*[^0-9a-f]*'),
  challenge_hash TEXT NOT NULL
    CHECK (length(challenge_hash) = 64 AND challenge_hash NOT GLOB '*[^0-9a-f]*'),
  return_channel TEXT NOT NULL CHECK (return_channel IN ('web', 'desktop')),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer'
    AND expires_at > created_at AND expires_at <= created_at + 300),
  consumed_at INTEGER CHECK (consumed_at IS NULL OR
    (typeof(consumed_at) = 'integer' AND consumed_at >= created_at))
);
CREATE INDEX auth_attempts_by_expiry ON auth_attempts(expires_at);

CREATE TABLE openid_nonces (
  nonce_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(nonce_hash) = 64 AND nonce_hash NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer'
    AND expires_at > created_at AND expires_at <= created_at + 600)
);
CREATE INDEX openid_nonces_by_expiry ON openid_nonces(expires_at);

CREATE TABLE desktop_grants (
  code_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(code_hash) = 64 AND code_hash NOT GLOB '*[^0-9a-f]*'),
  attempt_hash TEXT NOT NULL UNIQUE REFERENCES auth_attempts(state_hash) ON DELETE CASCADE,
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  challenge_hash TEXT NOT NULL
    CHECK (length(challenge_hash) = 64 AND challenge_hash NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer'
    AND expires_at > created_at AND expires_at <= created_at + 60),
  consumed_at INTEGER CHECK (consumed_at IS NULL OR
    (typeof(consumed_at) = 'integer' AND consumed_at >= created_at))
);
CREATE INDEX desktop_grants_by_expiry ON desktop_grants(expires_at);
