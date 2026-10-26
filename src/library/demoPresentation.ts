import nebula from '../assets/demo/nebula-drift.svg';
import forest from '../assets/demo/forestbound.svg';
import chrono from '../assets/demo/chrono-vale.svg';
import steel from '../assets/demo/steel-horizon.svg';

// Apresentação fictícia, exclusiva do provedor demo. Não é histórico ou arte Steam.
export const demoArtwork: Readonly<Record<number, { image: string; genre: string }>> = {
  101: { image: nebula, genre: 'Exploração espacial' },
  102: { image: forest, genre: 'Aventura e descoberta' },
  103: { image: chrono, genre: 'Uma jornada pelo tempo' },
  104: { image: steel, genre: 'Além da última fronteira' },
};
export const demoRecentAppIds = [101, 102, 103] as const;
export const demoFavoriteAppIds = [101, 102];
