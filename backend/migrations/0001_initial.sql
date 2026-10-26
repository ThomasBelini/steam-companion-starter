-- ESBOÇO para revisão. NÃO aplicar em produção sem autenticação verificada.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  steam_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT,
  profile_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (profile_visibility IN ('private', 'public'))
);
CREATE TABLE IF NOT EXISTS user_settings (
  steam_id TEXT PRIMARY KEY REFERENCES users(steam_id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_wishlist (
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  app_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (steam_id, app_id)
);
CREATE TABLE IF NOT EXISTS user_goals (
  steam_id TEXT NOT NULL REFERENCES users(steam_id) ON DELETE CASCADE,
  app_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'active', 'done')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (steam_id, app_id)
);
-- Sessões serão modeladas APÓS decisão do fluxo OpenID + deep links, não agora.
