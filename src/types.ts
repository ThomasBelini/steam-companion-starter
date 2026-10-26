export type Achievement = {
  id: string;
  name: string;
  description: string;
  achieved: boolean;
  // Nunca inferir tempo ou dificuldade a partir da raridade.
  estimatedDifficulty: 'desconhecida' | 'fácil' | 'média' | 'difícil';
  guideStatus: 'não-verificado' | 'indisponível';
};

export type Game = {
  appid: number;
  title: string;
  totalMinutes: number;
  achievements: Achievement[];
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
  getGames(): Promise<Game[]>;
}
