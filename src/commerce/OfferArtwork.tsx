import { demoGames } from '../demo';
import { LibraryArtwork } from '../library/LibraryArtwork';

// Only these explicitly fictitious offers receive the project's original demo artwork.
export function OfferArtwork({ title }: { title: string }) {
  const game = demoGames.find(item => item.title === title);
  return <div className="offer-artwork" aria-hidden="true">{game
    ? <LibraryArtwork game={game} demo />
    : <span className="offer-artwork-placeholder">{title.slice(0, 1)}</span>}</div>;
}
