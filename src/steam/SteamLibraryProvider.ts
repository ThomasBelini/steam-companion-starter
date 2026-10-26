import type { LibraryProvider } from '../types';
import { failure, type AchievementData, type LibraryResult, type Result } from '../library/contracts';
import { validAppId, validSteamId, type SteamApi } from './contracts';

export class SteamLibraryProvider implements LibraryProvider {
  readonly source = 'steam';

  // steamId deve vir de uma identidade autorizada no futuro backend, nunca de uma rota pública sem autorização.
  constructor(private readonly api: SteamApi, private readonly steamId: string) {}

  async getGames(signal?: AbortSignal): Promise<LibraryResult> {
    if (signal?.aborted) return failure('cancelled');
    if (!validSteamId(this.steamId)) return failure('invalid-input');
    try {
      const result = await this.api.getOwnedGames(this.steamId, signal);
      if (signal?.aborted) return failure('cancelled');
      if (!result.ok) return result;
      return { ok: true, data: {
        incomplete: result.data.incomplete,
        games: result.data.games.map(game => ({
          appid: game.appid, title: game.name ?? `App ${game.appid}`, totalMinutes: game.minutes,
          achievements: [], achievementsStatus: 'not-loaded', source: 'steam',
          accent: '#5b61cb', coverMark: '✦',
        })),
      } };
    } catch { return failure(signal?.aborted ? 'cancelled' : 'unavailable'); }
  }

  // Carregamento explícito por jogo: não disparar duas consultas para cada item da biblioteca ao abrir o app.
  async getGameAchievements(appid: number, signal?: AbortSignal): Promise<Result<AchievementData>> {
    if (signal?.aborted) return failure('cancelled');
    if (!validSteamId(this.steamId) || !validAppId(appid)) return failure('invalid-input');
    try {
      const schema = await this.api.getSchemaForGame(appid, signal);
      if (signal?.aborted) return failure('cancelled');
      if (!schema.ok) return schema;
      if (!schema.data.length) return { ok: true, data: { status: 'none', achievements: [] } };
      const player = await this.api.getPlayerAchievements(this.steamId, appid, signal);
      if (signal?.aborted || (!player.ok && player.error.code === 'cancelled')) return failure('cancelled');
      const progress = new Map(player.ok ? player.data.map(a => [a.id, a.achieved]) : []);
      const knownIds = new Set(schema.data.map(a => a.id));
      const incomplete = schema.data.some(a => !progress.has(a.id))
        || (player.ok && player.data.some(a => !knownIds.has(a.id)));
      return { ok: true, data: {
        status: !player.ok ? (player.error.code === 'private-or-unavailable' ? 'private-or-unavailable' : 'unavailable')
          : incomplete ? 'incomplete' : 'ready',
        ...(!player.ok ? { error: player.error } : {}),
        achievements: schema.data.map(definition => {
          const achieved = progress.get(definition.id) ?? null;
          const conceal = definition.hidden && achieved !== true;
          return {
            id: definition.id, achieved, hidden: definition.hidden,
            name: conceal ? 'Conquista oculta' : definition.name,
            description: conceal ? 'Descrição oculta para evitar spoilers.' : definition.description,
            estimatedDifficulty: 'desconhecida', guideStatus: 'indisponível',
          };
        }),
      } };
    } catch { return failure(signal?.aborted ? 'cancelled' : 'unavailable'); }
  }
}
