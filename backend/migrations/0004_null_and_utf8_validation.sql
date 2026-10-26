-- SQLite permite NULL em algumas PKs TEXT do rascunho 0001.
-- Fechar essa exceção sem reescrever migrações já aplicadas localmente.
DROP TRIGGER users_validate_insert;
DROP TRIGGER users_validate_update;
DROP TRIGGER settings_validate_insert;
DROP TRIGGER settings_validate_update;

CREATE TRIGGER users_validate_insert BEFORE INSERT ON users
WHEN NEW.steam_id IS NULL OR NOT (
  length(NEW.steam_id) BETWEEN 17 AND 20
  AND NEW.steam_id NOT GLOB '*[^0-9]*'
  AND substr(NEW.steam_id, 1, 1) BETWEEN '1' AND '9'
  AND (length(NEW.steam_id) < 20 OR NEW.steam_id <= '18446744073709551615')
)
BEGIN SELECT RAISE(ABORT, 'Invalid SteamID64'); END;

CREATE TRIGGER users_validate_update BEFORE UPDATE OF steam_id ON users
WHEN NEW.steam_id IS NULL OR NOT (
  length(NEW.steam_id) BETWEEN 17 AND 20
  AND NEW.steam_id NOT GLOB '*[^0-9]*'
  AND substr(NEW.steam_id, 1, 1) BETWEEN '1' AND '9'
  AND (length(NEW.steam_id) < 20 OR NEW.steam_id <= '18446744073709551615')
)
BEGIN SELECT RAISE(ABORT, 'Invalid SteamID64'); END;

CREATE TRIGGER settings_validate_insert BEFORE INSERT ON user_settings
WHEN NEW.steam_id IS NULL OR length(CAST(NEW.settings_json AS BLOB)) > 16384 OR
  CASE WHEN json_valid(NEW.settings_json) THEN json_type(NEW.settings_json) <> 'object' ELSE 1 END
BEGIN SELECT RAISE(ABORT, 'Invalid settings object'); END;

CREATE TRIGGER settings_validate_update BEFORE UPDATE OF steam_id, settings_json ON user_settings
WHEN NEW.steam_id IS NULL OR length(CAST(NEW.settings_json AS BLOB)) > 16384 OR
  CASE WHEN json_valid(NEW.settings_json) THEN json_type(NEW.settings_json) <> 'object' ELSE 1 END
BEGIN SELECT RAISE(ABORT, 'Invalid settings object'); END;

UPDATE users SET steam_id = steam_id;
UPDATE user_settings SET settings_json = settings_json;
