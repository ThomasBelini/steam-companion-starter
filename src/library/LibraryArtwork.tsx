import type { Game } from '../types';
import { demoArtwork } from './demoPresentation';

export function LibraryArtwork({ game, demo, className = '' }: { game: Game; demo: boolean; className?: string }) {
  const art = demo ? demoArtwork[game.appid] : undefined;
  return <div className={`library-artwork ${className}`} aria-hidden="true">
    {art ? <img src={art.image} alt="" draggable={false} /> : <span className="artwork-placeholder">{game.title.slice(0, 1)}</span>}
  </div>;
}
