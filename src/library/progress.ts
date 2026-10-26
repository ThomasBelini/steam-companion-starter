import type { Game } from '../types';

export function achievementPercent(game: Game): number | null {
  if ((game.achievementsStatus && game.achievementsStatus !== 'ready')
    || !game.achievements.length || game.achievements.some(a => a.achieved === null)) return null;
  const earned = game.achievements.filter(a => a.achieved === true).length;
  return earned === game.achievements.length ? 100 : Math.min(99, Math.round(earned / game.achievements.length * 100));
}

export function progressLabel(game: Game): string {
  const percent = achievementPercent(game);
  if (percent !== null) return `${percent}% completo`;
  return game.achievementsStatus === 'none' ? 'Sem conquistas' : 'Progresso indisponível';
}
