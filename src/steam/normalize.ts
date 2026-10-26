import { failure, type Result } from '../library/contracts';
import { validAppId, type AchievementDefinition, type OwnedGames, type PlayerAchievement } from './contracts';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function normalizeOwnedGames(body: unknown): Result<OwnedGames> {
  if (!record(body) || !record(body.response)) return failure('invalid-response');
  const response = body.response;
  if (Object.keys(response).length === 0) return failure('private-or-unavailable');
  if (response.game_count === 0 && (response.games === undefined || (Array.isArray(response.games) && !response.games.length))) {
    return { ok: true, data: { games: [], incomplete: false } };
  }
  if (!Array.isArray(response.games) || !response.games.length) return failure('incomplete-response');
  if (response.game_count !== undefined && (!integer(response.game_count) || response.game_count < response.games.length)) {
    return failure('invalid-response');
  }
  const games: OwnedGames['games'] = [];
  const ids = new Set<number>();
  let incomplete = response.game_count !== response.games.length;
  for (const game of response.games) {
    if (!record(game) || !validAppId(game.appid) || ids.has(game.appid)) return failure('invalid-response');
    ids.add(game.appid);
    const name = text(game.name) ? game.name : null;
    const minutes = integer(game.playtime_forever) ? game.playtime_forever : null;
    incomplete ||= name === null || minutes === null;
    games.push({ appid: game.appid, name, minutes });
  }
  return { ok: true, data: { games, incomplete } };
}

export function normalizeSchema(body: unknown): Result<AchievementDefinition[]> {
  if (!record(body) || !record(body.game)) return failure('invalid-response');
  const stats = body.game.availableGameStats;
  if (!record(stats) || !Array.isArray(stats.achievements)) return failure('incomplete-response');
  const definitions: AchievementDefinition[] = [];
  const ids = new Set<string>();
  for (const item of stats.achievements) {
    if (!record(item) || !text(item.name) || ids.has(item.name)
      || (item.hidden !== undefined && item.hidden !== 0 && item.hidden !== 1)) return failure('invalid-response');
    ids.add(item.name);
    definitions.push({
      id: item.name, name: text(item.displayName) ? item.displayName : item.name,
      description: text(item.description) ? item.description : 'Descrição indisponível.',
      // Ausência do indicador não é permissão para revelar uma conquista desconhecida.
      hidden: item.hidden !== 0,
    });
  }
  return { ok: true, data: definitions };
}

export function normalizePlayerAchievements(body: unknown, expectedSteamId: string): Result<PlayerAchievement[]> {
  if (!record(body) || !record(body.playerstats)) return failure('invalid-response');
  const stats = body.playerstats;
  if (stats.steamID !== undefined && stats.steamID !== expectedSteamId) return failure('invalid-response');
  if (stats.success === false) return failure('private-or-unavailable');
  if (stats.success !== true) return failure('invalid-response');
  if (!Array.isArray(stats.achievements)) return failure('incomplete-response');
  const achievements: PlayerAchievement[] = [];
  const ids = new Set<string>();
  for (const item of stats.achievements) {
    if (!record(item) || !text(item.apiname) || ids.has(item.apiname)
      || (item.achieved !== 0 && item.achieved !== 1)) return failure('invalid-response');
    ids.add(item.apiname);
    achievements.push({ id: item.apiname, achieved: item.achieved === 1 });
  }
  return { ok: true, data: achievements };
}
