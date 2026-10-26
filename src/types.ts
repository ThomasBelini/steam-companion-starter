export type Achievement = {
  id: string;
  name: string;
  description: string;
  achieved: boolean | null;
  hidden?: boolean;
  // Nunca inferir tempo ou dificuldade a partir da raridade.
  estimatedDifficulty: 'desconhecida' | 'fácil' | 'média' | 'difícil';
  guideStatus: 'não-verificado' | 'indisponível';
};

export type Game = {
  appid: number;
  title: string;
  totalMinutes: number | null;
  achievements: Achievement[];
  achievementsStatus?: 'ready' | 'none' | 'not-loaded' | 'incomplete' | 'private-or-unavailable' | 'unavailable';
  source?: 'demo' | 'steam';
  accent: string;
  coverMark: string;
};

export type Deal = {
  id: string;
  title: string;
  store: 'Steam' | 'Nuuvem' | 'Eneba';
  priceBRL: number;
  historicLowBRL: number | null;
  discountPercent: number | null;
  // Não confundir preço mostrado com valor final (taxas/cupom).
  finalPriceVerified: boolean;
  regionVerified: boolean;
  sourceUrl: string | null;
};

export interface LibraryProvider {
  readonly source: 'demo' | 'steam';
  getGames(signal?: AbortSignal): Promise<import('./library/contracts').LibraryResult>;
}
