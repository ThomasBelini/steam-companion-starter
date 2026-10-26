import type { Result } from '../library/contracts';

export type OwnedGame = { appid: number; name: string | null; minutes: number | null };
export type OwnedGames = { games: OwnedGame[]; incomplete: boolean };
export type AchievementDefinition = { id: string; name: string; description: string; hidden: boolean };
export type PlayerAchievement = { id: string; achieved: boolean };

// Contrato sem credenciais. O transporte real só pode ser implementado no servidor.
export interface SteamApi {
  getOwnedGames(steamId: string, signal?: AbortSignal): Promise<Result<OwnedGames>>;
  getPlayerAchievements(steamId: string, appid: number, signal?: AbortSignal): Promise<Result<PlayerAchievement[]>>;
  getSchemaForGame(appid: number, signal?: AbortSignal): Promise<Result<AchievementDefinition[]>>;
}

export const validAppId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;

export function validSteamId(value: string): boolean {
  return typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
}
