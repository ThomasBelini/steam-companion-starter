import { BadgePercent, CircleHelp, MapPin, ReceiptText, Store } from 'lucide-react';
import type { Deal } from '../types';
import { formatBRL, hasDemoPrice, lowestDemoOffer } from './demoOffers';
import { OfferArtwork } from './OfferArtwork';
import { WishToggle } from './CommerceParts';

export function OfferComparison({ title, offers, total, saved, onToggle }: {
  title: string; offers: readonly Deal[]; total: number; saved: boolean; onToggle: (title: string) => void;
}) {
  const lowest = lowestDemoOffer(offers);
  return <article className="offer-comparison" aria-label={`Comparar ofertas de ${title}`}>
    <header className="offer-game-cover"><OfferArtwork title={title} /><div className="offer-cover-shade" />
      <div className="offer-game-title"><span>JOGO FICTÍCIO</span><h2>{title}</h2></div>
      <span className="offer-cover-count">{offers.length} de {total} ofertas demo</span>
    </header>
    <div className="offer-comparison-heading"><span><Store size={14} aria-hidden="true" />Comparação entre lojas</span>
      <span>{lowest ? <>Menor valor exibido <strong>{formatBRL(lowest.priceBRL)}</strong><small>fictício · taxas não verificadas</small></> : 'Preço demonstrativo indisponível'}</span>
    </div>
    <ul className="offer-comparison-list">{offers.map(offer => <li className="offer-row" key={offer.id} aria-label={`Oferta ${offer.store} para ${title}`}>
      <div className="offer-store"><span className="offer-store-mark" aria-hidden="true">{offer.store.slice(0, 1)}</span><strong>{offer.store}</strong><span className="offer-demo-tag">DEMO</span></div>
      <div className="offer-value"><strong>{hasDemoPrice(offer) ? formatBRL(offer.priceBRL) : 'Preço indisponível'}</strong>
        <span>{offer.discountPercent !== null && Number.isFinite(offer.discountPercent) && offer.discountPercent >= 0 && offer.discountPercent <= 100 ? <><BadgePercent size={13} aria-hidden="true" />−{offer.discountPercent}% <span>(demo)</span></> : 'Desconto indisponível'}</span>
      </div>
      <WishToggle title={title} saved={saved} onToggle={onToggle} />
      <div className="offer-history"><CircleHelp size={13} aria-hidden="true" /><span>{offer.historicLowBRL !== null && Number.isFinite(offer.historicLowBRL) && offer.historicLowBRL >= 0
        ? `Mínimo ilustrativo: ${formatBRL(offer.historicLowBRL)}` : 'Histórico indisponível'}<small>Histórico real indisponível</small></span></div>
    </li>)}</ul>
    <footer className="offer-verification"><span><MapPin size={13} aria-hidden="true" />Ativação BR não verificada</span><span><ReceiptText size={13} aria-hidden="true" />Taxas adicionais não verificadas</span></footer>
  </article>;
}
