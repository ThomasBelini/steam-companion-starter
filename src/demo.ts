import type { Game, Deal, LibraryProvider } from './types';

// Dados 100% fictícios. NUNCA apresentar como dados reais Steam/lojas.
export const demoGames: Game[] = [
  {
    appid: 101, title: 'Nebula Drift', totalMinutes: 4970, accent: '#5b61cb', coverMark: '✦',
    achievements: [
      { id: 'a', name: 'Primeira viagem', description: 'Complete o prólogo.', achieved: true, estimatedDifficulty: 'fácil', guideStatus: 'indisponível' },
      { id: 'b', name: 'Explorador', description: 'Descubra dez áreas diferentes.', achieved: true, estimatedDifficulty: 'média', guideStatus: 'indisponível' },
      { id: 'c', name: 'Além das estrelas', description: 'Encontre a rota secreta.', achieved: false, estimatedDifficulty: 'desconhecida', guideStatus: 'não-verificado' },
      { id: 'd', name: 'Sem falhas', description: 'Conclua uma etapa sem sofrer dano.', achieved: false, estimatedDifficulty: 'difícil', guideStatus: 'não-verificado' },
    ],
  },
  {
    appid: 102, title: 'Forestbound', totalMinutes: 7284, accent: '#1c967c', coverMark: '❋',
    achievements: [
      { id: 'a', name: 'Primeiras sementes', description: 'Plante sua primeira árvore.', achieved: true, estimatedDifficulty: 'fácil', guideStatus: 'indisponível' },
      { id: 'b', name: 'Bosque dourado', description: 'Explore toda a floresta.', achieved: true, estimatedDifficulty: 'média', guideStatus: 'indisponível' },
      { id: 'c', name: 'Guardião', description: 'Restaure o coração da floresta.', achieved: true, estimatedDifficulty: 'difícil', guideStatus: 'indisponível' },
    ],
  },
  {
    appid: 103, title: 'Chrono Vale', totalMinutes: 2100, accent: '#b47b36', coverMark: '⌛',
    achievements: [
      { id: 'a', name: 'Bem-vindo', description: 'Inicie a campanha.', achieved: true, estimatedDifficulty: 'fácil', guideStatus: 'indisponível' },
      { id: 'b', name: 'Outro caminho', description: 'Descubra um final alternativo.', achieved: false, estimatedDifficulty: 'desconhecida', guideStatus: 'não-verificado' },
      { id: 'c', name: 'Colecionador', description: 'Encontre todos os fragmentos.', achieved: false, estimatedDifficulty: 'desconhecida', guideStatus: 'não-verificado' },
      { id: 'd', name: 'Mestre do tempo', description: 'Finalize o desafio final.', achieved: false, estimatedDifficulty: 'difícil', guideStatus: 'não-verificado' },
    ],
  },
  {
    appid: 104, title: 'Steel Horizon', totalMinutes: 235, accent: '#b7584d', coverMark: '⬡',
    achievements: [
      { id: 'a', name: 'Recruta', description: 'Complete o treinamento.', achieved: false, estimatedDifficulty: 'fácil', guideStatus: 'não-verificado' },
      { id: 'b', name: 'Veterano', description: 'Alcance a fase final.', achieved: false, estimatedDifficulty: 'desconhecida', guideStatus: 'não-verificado' },
    ],
  },
];

export const demoDeals: Deal[] = [
  { id: 'd1', title: 'Chrono Vale', store: 'Steam', priceBRL: 39.9, historicLowBRL: 29.9, discountPercent: 50, finalPriceVerified: false, regionVerified: false, sourceUrl: null },
  { id: 'd2', title: 'Chrono Vale', store: 'Nuuvem', priceBRL: 34.9, historicLowBRL: 26.9, discountPercent: 58, finalPriceVerified: false, regionVerified: false, sourceUrl: null },
  { id: 'd3', title: 'Chrono Vale', store: 'Eneba', priceBRL: 30.9, historicLowBRL: null, discountPercent: null, finalPriceVerified: false, regionVerified: false, sourceUrl: null },
  { id: 'd4', title: 'Nebula Drift', store: 'Steam', priceBRL: 27.99, historicLowBRL: 27.99, discountPercent: 65, finalPriceVerified: false, regionVerified: false, sourceUrl: null },
  { id: 'd5', title: 'Nebula Drift', store: 'Nuuvem', priceBRL: 32.99, historicLowBRL: 24.99, discountPercent: 59, finalPriceVerified: false, regionVerified: false, sourceUrl: null },
];

export class DemoLibraryProvider implements LibraryProvider {
  async getGames(): Promise<Game[]> { return demoGames; }
}
