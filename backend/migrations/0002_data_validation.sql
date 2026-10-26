-- Não reescrever 0001: acrescentar validação sem apagar dados do rascunho.
-- O executor de migrações D1 aplica esta migração atomicamente.
CREATE TRIGGER users_validate_insert BEFORE INSERT ON users
WHEN NOT (
  length(NEW.steam_id) BETWEEN 17 AND 20
  AND NEW.steam_id NOT GLOB '*[^0-9]*'
  AND substr(NEW.steam_id, 1, 1) BETWEEN '1' AND '9'
  AND (length(NEW.steam_id) < 20 OR NEW.steam_id <= '18446744073709551615')
)
BEGIN SELECT RAISE(ABORT, 'Invalid SteamID64'); END;

CREATE TRIGGER users_validate_update BEFORE UPDATE OF steam_id ON users
WHEN NOT (
  length(NEW.steam_id) BETWEEN 17 AND 20
  AND NEW.steam_id NOT GLOB '*[^0-9]*'
  AND substr(NEW.steam_id, 1, 1) BETWEEN '1' AND '9'
  AND (length(NEW.steam_id) < 20 OR NEW.steam_id <= '18446744073709551615')
)
BEGIN SELECT RAISE(ABORT, 'Invalid SteamID64'); END;

CREATE TRIGGER settings_validate_insert BEFORE INSERT ON user_settings
WHEN length(NEW.settings_json) > 16384 OR
  CASE WHEN json_valid(NEW.settings_json) THEN json_type(NEW.settings_json) <> 'object' ELSE 1 END
BEGIN SELECT RAISE(ABORT, 'Invalid settings object'); END;

CREATE TRIGGER settings_validate_update BEFORE UPDATE OF settings_json ON user_settings
WHEN length(NEW.settings_json) > 16384 OR
  CASE WHEN json_valid(NEW.settings_json) THEN json_type(NEW.settings_json) <> 'object' ELSE 1 END
BEGIN SELECT RAISE(ABORT, 'Invalid settings object'); END;

CREATE TRIGGER wishlist_validate_insert BEFORE INSERT ON user_wishlist
WHEN typeof(NEW.app_id) <> 'integer' OR NEW.app_id < 1 OR NEW.app_id > 4294967295
BEGIN SELECT RAISE(ABORT, 'Invalid AppID'); END;

CREATE TRIGGER wishlist_validate_update BEFORE UPDATE OF app_id ON user_wishlist
WHEN typeof(NEW.app_id) <> 'integer' OR NEW.app_id < 1 OR NEW.app_id > 4294967295
BEGIN SELECT RAISE(ABORT, 'Invalid AppID'); END;

CREATE TRIGGER goals_validate_insert BEFORE INSERT ON user_goals
WHEN typeof(NEW.app_id) <> 'integer' OR NEW.app_id < 1 OR NEW.app_id > 4294967295
BEGIN SELECT RAISE(ABORT, 'Invalid AppID'); END;

CREATE TRIGGER goals_validate_update BEFORE UPDATE OF app_id ON user_goals
WHEN typeof(NEW.app_id) <> 'integer' OR NEW.app_id < 1 OR NEW.app_id > 4294967295
BEGIN SELECT RAISE(ABORT, 'Invalid AppID'); END;

-- Rejeitar dados legados inválidos; nunca corrigi-los apagando dados silenciosamente.
UPDATE users SET steam_id = steam_id;
UPDATE user_settings SET settings_json = settings_json;
UPDATE user_wishlist SET app_id = app_id;
UPDATE user_goals SET app_id = app_id;
