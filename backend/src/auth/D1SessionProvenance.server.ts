import type { D1Database } from '@cloudflare/workers-types';

if ('window' in globalThis) throw new Error('A proveniência da sessão só pode ser lida no servidor.');

// Defesa preparatória de leitura, não middleware HTTP nem autorização de operações.
export async function inspectSessionProvenance(db: D1Database, tokenHash: string, channel: 'web' | 'desktop') {
  if (!/^[0-9a-f]{64}$/.test(tokenHash) || !['web', 'desktop'].includes(channel)) return { ok: false as const, error: 'rejected' as const };
  try {
    const row = await db.prepare(`SELECT s.steam_id FROM sessions s
      JOIN session_origins o ON o.attempt_hash = s.source_attempt_hash AND o.session_hash = s.token_hash
        AND o.steam_id = s.steam_id AND o.grant_hash IS s.source_grant_hash AND o.issued_at = s.created_at
      JOIN verified_openid_assertions v ON v.attempt_hash = o.attempt_hash AND v.steam_id = s.steam_id
        AND v.return_channel = s.client_kind AND v.integrity_version = 1 AND v.verified_at <= s.created_at
      WHERE s.token_hash = ? AND s.client_kind = ? AND s.integrity_version = 1
        AND s.revoked_at IS NULL AND s.created_at <= unixepoch() AND s.expires_at > unixepoch()
        AND s.last_seen_at > unixepoch() - 900 AND s.last_seen_at <= unixepoch()
        AND ((s.client_kind = 'web' AND s.source_grant_hash IS NULL AND s.csrf_token_hash IS NOT NULL)
          OR (s.client_kind = 'desktop' AND s.source_grant_hash IS NOT NULL))`)
      .bind(tokenHash, channel).first<{ steam_id: string }>();
    return row ? { ok: true as const, stage: 'session-provenance-checked-not-authorized' as const, steamId: row.steam_id }
      : { ok: false as const, error: 'rejected' as const };
  } catch { return { ok: false as const, error: 'unavailable' as const }; }
}
