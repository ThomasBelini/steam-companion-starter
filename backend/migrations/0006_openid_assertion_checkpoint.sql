-- Preparação interna; não habilita rotas, grants ou emissão de sessões.
CREATE TABLE auth_attempt_contexts (
  attempt_hash TEXT PRIMARY KEY NOT NULL REFERENCES auth_attempts(state_hash) ON DELETE CASCADE,
  browser_binding_hash TEXT NOT NULL CHECK (typeof(browser_binding_hash) = 'text'
    AND length(CAST(browser_binding_hash AS BLOB)) = 64 AND browser_binding_hash NOT GLOB '*[^0-9a-f]*'),
  expected_return_to TEXT NOT NULL CHECK (length(CAST(expected_return_to AS BLOB)) BETWEEN 1 AND 2048),
  realm TEXT NOT NULL CHECK (length(CAST(realm AS BLOB)) BETWEEN 1 AND 2048)
);

-- Registro de proveniência durável: sem FK para a tentativa temporária.
-- Retenção/exclusão de identidade deverá ser especificada antes de uso real.
CREATE TABLE verified_openid_assertions (
  attempt_hash TEXT PRIMARY KEY NOT NULL CHECK (typeof(attempt_hash) = 'text'
    AND length(CAST(attempt_hash AS BLOB)) = 64 AND attempt_hash NOT GLOB '*[^0-9a-f]*'),
  nonce_hash TEXT NOT NULL UNIQUE CHECK (typeof(nonce_hash) = 'text'
    AND length(CAST(nonce_hash AS BLOB)) = 64 AND nonce_hash NOT GLOB '*[^0-9a-f]*'),
  steam_id TEXT NOT NULL CHECK (typeof(steam_id) = 'text' AND length(steam_id) BETWEEN 17 AND 20
    AND length(CAST(steam_id AS BLOB)) = length(steam_id) AND steam_id NOT GLOB '*[^0-9]*'
    AND substr(steam_id, 1, 1) BETWEEN '1' AND '9'
    AND (length(steam_id) < 20 OR steam_id <= '18446744073709551615')),
  claimed_id TEXT NOT NULL CHECK (claimed_id = 'https://steamcommunity.com/openid/id/' || steam_id
    OR claimed_id = 'http://steamcommunity.com/openid/id/' || steam_id),
  op_endpoint TEXT NOT NULL CHECK (op_endpoint = 'https://steamcommunity.com/openid/login'),
  return_channel TEXT NOT NULL CHECK (return_channel IN ('web', 'desktop')),
  challenge_hash TEXT NOT NULL CHECK (typeof(challenge_hash) = 'text'
    AND length(CAST(challenge_hash AS BLOB)) = 64 AND challenge_hash NOT GLOB '*[^0-9a-f]*'),
  verified_at INTEGER NOT NULL CHECK (typeof(verified_at) = 'integer'),
  nonce_issued_at INTEGER NOT NULL CHECK (typeof(nonce_issued_at) = 'integer'),
  integrity_version INTEGER NOT NULL DEFAULT 1 CHECK (integrity_version = 1)
);

CREATE TRIGGER assertion_attempt_reuse_guard BEFORE INSERT ON auth_attempts
WHEN EXISTS (SELECT 1 FROM verified_openid_assertions WHERE attempt_hash = NEW.state_hash)
BEGIN SELECT RAISE(ABORT, 'Assertion attempt already recorded'); END;

CREATE TRIGGER attempt_context_insert_guard BEFORE INSERT ON auth_attempt_contexts
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM auth_attempt_contexts WHERE attempt_hash = NEW.attempt_hash)
    OR EXISTS (SELECT 1 FROM verified_openid_assertions WHERE attempt_hash = NEW.attempt_hash)
    OR NOT EXISTS (SELECT 1 FROM auth_attempts WHERE state_hash = NEW.attempt_hash
      AND integrity_version = 1 AND consumed_at IS NULL AND created_at <= unixepoch() AND expires_at > unixepoch())
    THEN RAISE(ABORT, 'Invalid attempt context') END;
END;
CREATE TRIGGER attempt_context_update_guard BEFORE UPDATE ON auth_attempt_contexts
BEGIN SELECT RAISE(ABORT, 'Immutable attempt context'); END;
-- Não substituir vínculo do navegador por DELETE + INSERT enquanto a tentativa existe.
CREATE TRIGGER attempt_context_delete_guard BEFORE DELETE ON auth_attempt_contexts
WHEN EXISTS (SELECT 1 FROM auth_attempts WHERE state_hash = OLD.attempt_hash)
BEGIN SELECT RAISE(ABORT, 'Delete temporary attempt instead'); END;

CREATE TRIGGER assertion_insert_guard BEFORE INSERT ON verified_openid_assertions
BEGIN
  SELECT CASE WHEN NEW.verified_at <> unixepoch() OR NEW.nonce_issued_at <= unixepoch() - 300
    OR NEW.nonce_issued_at > unixepoch() + 60
    OR EXISTS (SELECT 1 FROM verified_openid_assertions WHERE attempt_hash = NEW.attempt_hash OR nonce_hash = NEW.nonce_hash)
    OR EXISTS (SELECT 1 FROM session_origins WHERE attempt_hash = NEW.attempt_hash)
    OR NOT EXISTS (SELECT 1 FROM auth_attempts a JOIN auth_attempt_contexts c ON c.attempt_hash = a.state_hash
      WHERE a.state_hash = NEW.attempt_hash AND a.integrity_version = 1 AND a.consumed_at IS NULL
      AND a.return_channel = NEW.return_channel AND a.challenge_hash = NEW.challenge_hash
      AND a.created_at <= unixepoch() AND a.expires_at > unixepoch())
    THEN RAISE(ABORT, 'Invalid assertion checkpoint') END;
END;
-- Instrução única: duplicação/falha de nonce aborta também a asserção inteira.
CREATE TRIGGER assertion_record_nonce AFTER INSERT ON verified_openid_assertions
BEGIN
  INSERT INTO openid_nonces (nonce_hash, created_at, expires_at)
    VALUES (NEW.nonce_hash, NEW.verified_at, NEW.verified_at + 600);
END;
CREATE TRIGGER assertion_update_guard BEFORE UPDATE ON verified_openid_assertions
BEGIN SELECT RAISE(ABORT, 'Immutable verified assertion'); END;
CREATE TRIGGER assertion_delete_guard BEFORE DELETE ON verified_openid_assertions
BEGIN SELECT RAISE(ABORT, 'Assertion retention requires explicit policy'); END;

-- Representação integral: GLOB/length(TEXT) isolados não detectam sufixos após NUL.
CREATE TRIGGER context_hash_bytes_guard BEFORE INSERT ON auth_attempt_contexts
WHEN length(NEW.browser_binding_hash) <> 64
BEGIN SELECT RAISE(ABORT, 'Invalid browser hash representation'); END;
CREATE TRIGGER assertion_hash_bytes_guard BEFORE INSERT ON verified_openid_assertions
WHEN length(NEW.attempt_hash) <> 64 OR length(NEW.nonce_hash) <> 64 OR length(NEW.challenge_hash) <> 64
BEGIN SELECT RAISE(ABORT, 'Invalid assertion hash representation'); END;
CREATE TRIGGER nonce_hash_bytes_guard BEFORE INSERT ON openid_nonces
WHEN typeof(NEW.nonce_hash) <> 'text' OR length(CAST(NEW.nonce_hash AS BLOB)) <> 64
BEGIN SELECT RAISE(ABORT, 'Invalid nonce hash representation'); END;
