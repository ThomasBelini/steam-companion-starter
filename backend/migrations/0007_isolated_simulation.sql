-- Laboratório interno. Nunca gravar identidades demo nas tabelas OpenID/usuários/sessões.
-- Migrações 0001–0006 preservadas. Sem backfill nem FK para identidades reais.
CREATE TABLE simulation_attempts (
  state_hash TEXT PRIMARY KEY NOT NULL CHECK (typeof(state_hash) = 'text' AND length(state_hash) = 64 AND length(CAST(state_hash AS BLOB)) = 64 AND state_hash NOT GLOB '*[^0-9a-f]*'),
  challenge_hash TEXT NOT NULL CHECK (typeof(challenge_hash) = 'text' AND length(challenge_hash) = 64 AND length(CAST(challenge_hash AS BLOB)) = 64 AND challenge_hash NOT GLOB '*[^0-9a-f]*'),
  browser_hash TEXT NOT NULL CHECK (typeof(browser_hash) = 'text' AND length(browser_hash) = 64 AND length(CAST(browser_hash AS BLOB)) = 64 AND browser_hash NOT GLOB '*[^0-9a-f]*'),
  csrf_hash TEXT NOT NULL CHECK (typeof(csrf_hash) = 'text' AND length(csrf_hash) = 64 AND length(CAST(csrf_hash AS BLOB)) = 64 AND csrf_hash NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer' AND expires_at > created_at AND expires_at <= created_at + 300),
  approved_subject TEXT CHECK (approved_subject IN ('demo:alice', 'demo:bob')),
  approved_at INTEGER,
  cancelled_at INTEGER,
  finalized_at INTEGER
);
CREATE INDEX simulation_attempts_by_expiry ON simulation_attempts(expires_at);
CREATE TABLE simulation_assertions (
  attempt_hash TEXT PRIMARY KEY NOT NULL REFERENCES simulation_attempts(state_hash) ON DELETE RESTRICT,
  issuer TEXT NOT NULL CHECK (issuer = 'companion-simulation-only'),
  subject TEXT NOT NULL CHECK (subject IN ('demo:alice', 'demo:bob')),
  nonce_hash TEXT NOT NULL UNIQUE CHECK (typeof(nonce_hash) = 'text' AND length(nonce_hash) = 64 AND length(CAST(nonce_hash AS BLOB)) = 64 AND nonce_hash NOT GLOB '*[^0-9a-f]*'),
  verified_at INTEGER NOT NULL CHECK (typeof(verified_at) = 'integer'),
  issued_at INTEGER NOT NULL CHECK (typeof(issued_at) = 'integer')
);
CREATE TABLE simulation_grants (
  code_hash TEXT PRIMARY KEY NOT NULL CHECK (typeof(code_hash) = 'text' AND length(code_hash) = 64 AND length(CAST(code_hash AS BLOB)) = 64 AND code_hash NOT GLOB '*[^0-9a-f]*'),
  attempt_hash TEXT NOT NULL UNIQUE REFERENCES simulation_assertions(attempt_hash) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer'),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer' AND expires_at > created_at AND expires_at <= created_at + 60),
  consumed_at INTEGER
);
CREATE TRIGGER simulation_attempt_insert BEFORE INSERT ON simulation_attempts
WHEN NEW.created_at <> unixepoch() OR NEW.expires_at <= unixepoch()
  OR NEW.approved_subject IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL OR NEW.finalized_at IS NOT NULL
  OR EXISTS (SELECT 1 FROM simulation_attempts WHERE state_hash = NEW.state_hash)
BEGIN SELECT RAISE(ABORT, 'Invalid simulation attempt'); END;
CREATE TRIGGER simulation_attempt_update BEFORE UPDATE ON simulation_attempts
BEGIN
  SELECT CASE WHEN NEW.state_hash IS NOT OLD.state_hash OR NEW.challenge_hash IS NOT OLD.challenge_hash
    OR NEW.browser_hash IS NOT OLD.browser_hash OR NEW.csrf_hash IS NOT OLD.csrf_hash
    OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
    OR OLD.cancelled_at IS NOT NULL OR OLD.finalized_at IS NOT NULL OR OLD.expires_at <= unixepoch()
    THEN RAISE(ABORT, 'Immutable or closed simulation attempt') END;
  SELECT CASE WHEN (NEW.approved_at IS NOT OLD.approved_at OR NEW.approved_subject IS NOT OLD.approved_subject) AND (
    OLD.approved_at IS NOT NULL OR NEW.approved_at IS NOT unixepoch() OR NEW.approved_subject IS NULL
    OR NOT EXISTS (SELECT 1 FROM simulation_assertions v WHERE v.attempt_hash = OLD.state_hash AND v.subject = NEW.approved_subject))
    THEN RAISE(ABORT, 'Invalid simulation approval') END;
  SELECT CASE WHEN NEW.cancelled_at IS NOT OLD.cancelled_at AND (NEW.cancelled_at IS NOT unixepoch() OR NEW.finalized_at IS NOT NULL)
    THEN RAISE(ABORT, 'Invalid simulation cancellation') END;
  SELECT CASE WHEN NEW.finalized_at IS NOT OLD.finalized_at AND (NEW.finalized_at IS NOT unixepoch() OR NEW.cancelled_at IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM simulation_grants g WHERE g.attempt_hash = OLD.state_hash AND g.consumed_at = NEW.finalized_at))
    THEN RAISE(ABORT, 'Invalid simulation completion') END;
END;
CREATE TRIGGER simulation_assertion_insert BEFORE INSERT ON simulation_assertions
WHEN NEW.verified_at <> unixepoch() OR NEW.issued_at <= unixepoch() - 300 OR NEW.issued_at > unixepoch() + 60
  OR EXISTS (SELECT 1 FROM simulation_assertions WHERE attempt_hash = NEW.attempt_hash OR nonce_hash = NEW.nonce_hash)
  OR NOT EXISTS (SELECT 1 FROM simulation_attempts a WHERE a.state_hash = NEW.attempt_hash AND a.cancelled_at IS NULL
    AND a.finalized_at IS NULL AND a.expires_at > unixepoch())
BEGIN SELECT RAISE(ABORT, 'Invalid simulation assertion'); END;
CREATE TRIGGER simulation_assertion_update BEFORE UPDATE ON simulation_assertions
BEGIN SELECT RAISE(ABORT, 'Immutable simulation assertion'); END;
CREATE TRIGGER simulation_grant_insert BEFORE INSERT ON simulation_grants
WHEN NEW.created_at <> unixepoch() OR NEW.consumed_at IS NOT NULL OR NEW.expires_at <= unixepoch()
  OR EXISTS (SELECT 1 FROM simulation_grants WHERE code_hash = NEW.code_hash OR attempt_hash = NEW.attempt_hash)
  OR NOT EXISTS (SELECT 1 FROM simulation_attempts a JOIN simulation_assertions v ON v.attempt_hash = a.state_hash
    WHERE a.state_hash = NEW.attempt_hash AND a.cancelled_at IS NULL AND a.finalized_at IS NULL
    AND a.approved_subject = v.subject AND a.approved_at IS NOT NULL AND NEW.expires_at <= a.expires_at AND a.expires_at > unixepoch())
BEGIN SELECT RAISE(ABORT, 'Invalid simulation grant'); END;
CREATE TRIGGER simulation_grant_update BEFORE UPDATE ON simulation_grants
BEGIN
  SELECT CASE WHEN NEW.code_hash IS NOT OLD.code_hash OR NEW.attempt_hash IS NOT OLD.attempt_hash
    OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
    OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NOT unixepoch() OR OLD.expires_at <= unixepoch()
    OR NOT EXISTS (SELECT 1 FROM simulation_attempts a JOIN simulation_assertions v ON v.attempt_hash = a.state_hash
      WHERE a.state_hash = OLD.attempt_hash AND a.cancelled_at IS NULL AND a.finalized_at IS NULL
      AND a.approved_subject = v.subject AND a.approved_at IS NOT NULL AND a.expires_at > unixepoch())
    THEN RAISE(ABORT, 'Invalid simulation consumption') END;
END;
-- Consumo e conclusão: uma instrução, com rollback inclusive se a segunda escrita falhar.
CREATE TRIGGER simulation_grant_complete AFTER UPDATE OF consumed_at ON simulation_grants
BEGIN
  UPDATE simulation_attempts SET finalized_at = NEW.consumed_at WHERE state_hash = NEW.attempt_hash AND finalized_at IS NULL AND cancelled_at IS NULL;
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'Simulation already finalized') END;
END;
-- Tombstones locais: não liberar replay por DELETE/REPLACE. Retenção real permanece pendente.
CREATE TRIGGER simulation_attempt_delete BEFORE DELETE ON simulation_attempts
BEGIN SELECT RAISE(ABORT, 'Simulation retention requires explicit policy'); END;
CREATE TRIGGER simulation_assertion_delete BEFORE DELETE ON simulation_assertions
BEGIN SELECT RAISE(ABORT, 'Simulation retention requires explicit policy'); END;
CREATE TRIGGER simulation_grant_delete BEFORE DELETE ON simulation_grants
BEGIN SELECT RAISE(ABORT, 'Simulation retention requires explicit policy'); END;
