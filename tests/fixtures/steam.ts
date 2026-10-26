// Identificadores e conteúdos sintéticos; nunca usados em uma consulta real.
export const steamId = '10000000000000000';
export const ownedBody = { response: { game_count: 1, games: [
  { appid: 101, name: 'Jogo de teste', playtime_forever: 120 },
] } };
export const schemaBody = { game: { availableGameStats: { achievements: [
  { name: 'FIRST', displayName: 'Primeiro passo', description: 'Comece o jogo.', hidden: 0 },
  { name: 'SECRET', displayName: 'Título secreto', description: 'Solução secreta.', hidden: 1 },
] } } };
export const playerBody = { playerstats: { steamID: steamId, success: true, achievements: [
  { apiname: 'SECRET', achieved: 0, unlocktime: 0 },
  { apiname: 'FIRST', achieved: 1, unlocktime: 100 },
] } };
