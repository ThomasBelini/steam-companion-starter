-- Somente integridade SQL; não verifica OpenID nem habilita autenticação.
-- Preservar todos os dados legados, sem inventar proveniência/consentimento.
ALTER TABLE auth_attempts ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1 CHECK (integrity_version IN (0, 1));
ALTER TABLE desktop_grants ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1 CHECK (integrity_version IN (0, 1));
ALTER TABLE sessions ADD COLUMN integrity_version INTEGER NOT NULL DEFAULT 1 CHECK (integrity_version IN (0, 1));
UPDATE auth_attempts SET integrity_version = 0;
UPDATE desktop_grants SET integrity_version = 0;
UPDATE sessions SET integrity_version = 0;

-- Histórico de emissão sobrevive à limpeza de tentativas/grants e de sessões.
-- Exclusão explícita do usuário remove seus dados; não há FK para registros temporários.
CREATE TABLE session_origins (
  attempt_hash TEXT PRIMARY KEY NOT NULL CHECK (length(attempt_hash) = 64 AND attempt_hash NOT GLOB '*[^0-9a-f]*'),
  grant_hash TEXT UNIQUE CHECK (grant_hash IS NULL OR (length(grant_hash) = 64 AND grant_hash NOT GLOB '*[^0-9a-f]*')),
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  session_hash TEXT UNIQUE REFERENCES sessions(token_hash) ON DELETE SET NULL,
  issued_at INTEGER NOT NULL CHECK (typeof(issued_at) = 'integer' AND issued_at >= 0)
);
ALTER TABLE sessions ADD COLUMN source_attempt_hash TEXT
  REFERENCES session_origins(attempt_hash) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sessions ADD COLUMN source_grant_hash TEXT;
CREATE UNIQUE INDEX sessions_one_per_attempt ON sessions(source_attempt_hash);
CREATE UNIQUE INDEX sessions_one_per_grant ON sessions(source_grant_hash);
CREATE INDEX session_origins_by_user ON session_origins(steam_id);

-- length(TEXT)/GLOB param no byte NUL; comparar representação completa em bytes.
CREATE TRIGGER users_ascii_insert_guard BEFORE INSERT ON users
WHEN typeof(NEW.steam_id) <> 'text' OR length(CAST(NEW.steam_id AS BLOB)) <> length(NEW.steam_id)
BEGIN SELECT RAISE(ABORT, 'Invalid SteamID64 representation'); END;
CREATE TRIGGER users_ascii_update_guard BEFORE UPDATE OF steam_id ON users
WHEN typeof(NEW.steam_id) <> 'text' OR length(CAST(NEW.steam_id AS BLOB)) <> length(NEW.steam_id)
BEGIN SELECT RAISE(ABORT, 'Invalid SteamID64 representation'); END;

CREATE TRIGGER attempts_insert_guard BEFORE INSERT ON auth_attempts
BEGIN
  SELECT CASE WHEN NEW.integrity_version <> 1 OR NEW.consumed_at IS NOT NULL
    OR typeof(NEW.state_hash) <> 'text' OR length(CAST(NEW.state_hash AS BLOB)) <> 64
    OR typeof(NEW.challenge_hash) <> 'text' OR length(CAST(NEW.challenge_hash AS BLOB)) <> 64
    OR NEW.created_at > unixepoch() OR NEW.expires_at <= unixepoch()
    OR EXISTS (SELECT 1 FROM auth_attempts WHERE state_hash = NEW.state_hash)
    OR EXISTS (SELECT 1 FROM session_origins WHERE attempt_hash = NEW.state_hash)
    THEN RAISE(ABORT, 'Invalid or reused attempt') END;
END;

CREATE TRIGGER attempts_update_guard BEFORE UPDATE ON auth_attempts
BEGIN
  SELECT CASE WHEN NEW.state_hash IS NOT OLD.state_hash
    OR NEW.challenge_hash IS NOT OLD.challenge_hash OR NEW.return_channel IS NOT OLD.return_channel
    OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
    OR NEW.integrity_version IS NOT OLD.integrity_version
    THEN RAISE(ABORT, 'Immutable attempt') END;
  SELECT CASE WHEN NEW.consumed_at IS NOT OLD.consumed_at AND (
    OLD.integrity_version <> 1 OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
    OR typeof(NEW.consumed_at) <> 'integer' OR NEW.consumed_at < OLD.created_at
    OR NEW.consumed_at >= OLD.expires_at OR NEW.consumed_at > unixepoch() OR OLD.expires_at <= unixepoch())
    THEN RAISE(ABORT, 'Invalid attempt consumption') END;
END;

CREATE TRIGGER grants_insert_guard BEFORE INSERT ON desktop_grants
BEGIN
  SELECT CASE WHEN NEW.integrity_version <> 1 OR NEW.consumed_at IS NOT NULL
    OR typeof(NEW.code_hash) <> 'text' OR length(CAST(NEW.code_hash AS BLOB)) <> 64
    OR typeof(NEW.challenge_hash) <> 'text' OR length(CAST(NEW.challenge_hash AS BLOB)) <> 64
    OR NEW.created_at > unixepoch() OR NEW.expires_at <= unixepoch()
    OR EXISTS (SELECT 1 FROM desktop_grants WHERE code_hash = NEW.code_hash)
    OR EXISTS (SELECT 1 FROM session_origins WHERE grant_hash = NEW.code_hash OR attempt_hash = NEW.attempt_hash)
    OR NOT EXISTS (SELECT 1 FROM auth_attempts a WHERE a.state_hash = NEW.attempt_hash
      AND a.integrity_version = 1 AND a.return_channel = 'desktop' AND a.consumed_at IS NULL
      AND a.challenge_hash = NEW.challenge_hash AND NEW.created_at >= a.created_at
      AND NEW.created_at < a.expires_at AND NEW.expires_at <= a.expires_at AND a.expires_at > unixepoch())
    THEN RAISE(ABORT, 'Invalid grant origin') END;
END;

CREATE TRIGGER grants_consume_attempt AFTER INSERT ON desktop_grants
BEGIN
  UPDATE auth_attempts SET consumed_at = NEW.created_at WHERE state_hash = NEW.attempt_hash AND consumed_at IS NULL;
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'Attempt already consumed') END;
END;

CREATE TRIGGER grants_update_guard BEFORE UPDATE ON desktop_grants
BEGIN
  SELECT CASE WHEN NEW.code_hash IS NOT OLD.code_hash OR NEW.attempt_hash IS NOT OLD.attempt_hash
    OR NEW.steam_id IS NOT OLD.steam_id OR NEW.challenge_hash IS NOT OLD.challenge_hash
    OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
    OR NEW.integrity_version IS NOT OLD.integrity_version
    THEN RAISE(ABORT, 'Immutable grant') END;
  SELECT CASE WHEN NEW.consumed_at IS NOT OLD.consumed_at AND (
    OLD.integrity_version <> 1 OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
    OR typeof(NEW.consumed_at) <> 'integer' OR NEW.consumed_at < OLD.created_at
    OR NEW.consumed_at >= OLD.expires_at OR NEW.consumed_at > unixepoch() OR OLD.expires_at <= unixepoch())
    THEN RAISE(ABORT, 'Invalid grant consumption') END;
END;

CREATE TRIGGER sessions_insert_guard BEFORE INSERT ON sessions
BEGIN
  SELECT CASE WHEN NEW.integrity_version <> 1 OR NEW.source_attempt_hash IS NULL OR NEW.revoked_at IS NOT NULL
    OR typeof(NEW.token_hash) <> 'text' OR length(CAST(NEW.token_hash AS BLOB)) <> 64
    OR (NEW.csrf_token_hash IS NOT NULL AND (typeof(NEW.csrf_token_hash) <> 'text' OR length(CAST(NEW.csrf_token_hash AS BLOB)) <> 64))
    OR NEW.created_at > unixepoch() OR NEW.expires_at <= unixepoch()
    OR NEW.last_seen_at <> NEW.created_at OR NEW.last_seen_at <= unixepoch() - 900
    OR EXISTS (SELECT 1 FROM sessions WHERE token_hash = NEW.token_hash)
    OR EXISTS (SELECT 1 FROM session_origins WHERE attempt_hash = NEW.source_attempt_hash
      OR (NEW.source_grant_hash IS NOT NULL AND grant_hash = NEW.source_grant_hash))
    THEN RAISE(ABORT, 'Invalid session origin') END;
  SELECT CASE WHEN NEW.client_kind = 'web' AND (NEW.source_grant_hash IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM auth_attempts a WHERE a.state_hash = NEW.source_attempt_hash
      AND a.integrity_version = 1 AND a.return_channel = 'web' AND a.consumed_at IS NULL
      AND NEW.created_at >= a.created_at AND NEW.created_at < a.expires_at AND a.expires_at > unixepoch()))
    THEN RAISE(ABORT, 'Invalid web attempt') END;
  SELECT CASE WHEN NEW.client_kind = 'desktop' AND (NEW.source_grant_hash IS NULL OR NOT EXISTS (
    SELECT 1 FROM desktop_grants g JOIN auth_attempts a ON a.state_hash = g.attempt_hash
      WHERE g.code_hash = NEW.source_grant_hash AND g.attempt_hash = NEW.source_attempt_hash
      AND g.integrity_version = 1 AND a.integrity_version = 1 AND a.return_channel = 'desktop'
      AND a.challenge_hash = g.challenge_hash AND a.consumed_at = g.created_at
      AND g.steam_id = NEW.steam_id AND g.consumed_at IS NULL
      AND NEW.created_at >= g.created_at AND NEW.created_at < g.expires_at AND g.expires_at > unixepoch()))
    THEN RAISE(ABORT, 'Invalid desktop grant') END;
END;

-- Uma única inserção valida, consome e registra emissão. ABORT desfaz toda a instrução.
CREATE TRIGGER sessions_record_origin AFTER INSERT ON sessions
BEGIN
  UPDATE auth_attempts SET consumed_at = NEW.created_at
    WHERE state_hash = NEW.source_attempt_hash AND NEW.client_kind = 'web' AND consumed_at IS NULL;
  SELECT CASE WHEN NEW.client_kind = 'web' AND changes() <> 1 THEN RAISE(ABORT, 'Attempt already consumed') END;
  UPDATE desktop_grants SET consumed_at = NEW.created_at
    WHERE code_hash = NEW.source_grant_hash AND NEW.client_kind = 'desktop' AND consumed_at IS NULL;
  SELECT CASE WHEN NEW.client_kind = 'desktop' AND changes() <> 1 THEN RAISE(ABORT, 'Grant already consumed') END;
  INSERT INTO session_origins (attempt_hash, grant_hash, steam_id, session_hash, issued_at)
    VALUES (NEW.source_attempt_hash, NEW.source_grant_hash, NEW.steam_id, NEW.token_hash, NEW.created_at);
END;

CREATE TRIGGER sessions_update_guard BEFORE UPDATE ON sessions
BEGIN
  SELECT CASE WHEN NEW.token_hash IS NOT OLD.token_hash OR NEW.steam_id IS NOT OLD.steam_id
    OR NEW.client_kind IS NOT OLD.client_kind OR NEW.csrf_token_hash IS NOT OLD.csrf_token_hash
    OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
    OR NEW.integrity_version IS NOT OLD.integrity_version
    OR NEW.source_attempt_hash IS NOT OLD.source_attempt_hash OR NEW.source_grant_hash IS NOT OLD.source_grant_hash
    THEN RAISE(ABORT, 'Immutable session') END;
  SELECT CASE WHEN NEW.revoked_at IS NOT OLD.revoked_at AND (
    OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR typeof(NEW.revoked_at) <> 'integer'
    OR NEW.revoked_at < OLD.created_at OR NEW.revoked_at > unixepoch())
    THEN RAISE(ABORT, 'Irreversible revocation') END;
  SELECT CASE WHEN NEW.last_seen_at IS NOT OLD.last_seen_at AND (
    OLD.integrity_version <> 1 OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NOT NULL
    OR OLD.expires_at <= unixepoch() OR OLD.last_seen_at <= unixepoch() - 900
    OR NEW.last_seen_at < OLD.last_seen_at OR NEW.last_seen_at > unixepoch())
    THEN RAISE(ABORT, 'Inactive session cannot resume') END;
END;

CREATE TRIGGER origins_insert_guard BEFORE INSERT ON session_origins
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM session_origins WHERE attempt_hash = NEW.attempt_hash
    OR (NEW.grant_hash IS NOT NULL AND grant_hash = NEW.grant_hash))
    OR NOT EXISTS (SELECT 1 FROM sessions s WHERE s.token_hash = NEW.session_hash AND s.integrity_version = 1
      AND s.source_attempt_hash = NEW.attempt_hash AND s.source_grant_hash IS NEW.grant_hash
      AND s.steam_id = NEW.steam_id AND s.created_at = NEW.issued_at)
    THEN RAISE(ABORT, 'Invalid issuance record') END;
END;

CREATE TRIGGER origins_update_guard BEFORE UPDATE ON session_origins
BEGIN
  -- Única alteração permitida: FK limpa o token-hash quando a sessão é excluída.
  SELECT CASE WHEN NEW.attempt_hash IS NOT OLD.attempt_hash OR NEW.grant_hash IS NOT OLD.grant_hash
    OR NEW.steam_id IS NOT OLD.steam_id OR NEW.issued_at IS NOT OLD.issued_at
    OR NOT (NEW.session_hash IS OLD.session_hash OR (NEW.session_hash IS NULL
      AND NOT EXISTS (SELECT 1 FROM sessions WHERE token_hash = OLD.session_hash)))
    THEN RAISE(ABORT, 'Immutable issuance record') END;
END;

CREATE TRIGGER origins_delete_guard BEFORE DELETE ON session_origins
WHEN EXISTS (SELECT 1 FROM users WHERE steam_id = OLD.steam_id)
BEGIN SELECT RAISE(ABORT, 'Keep issuance history until user deletion'); END;
