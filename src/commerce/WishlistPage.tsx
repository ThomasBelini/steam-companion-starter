import { useRef, useState } from 'react';
import { ArrowRight, BellOff, Heart, Layers3, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Deal } from '../types';
import { formatBRL, lowestDemoOffer } from './demoOffers';
import { OfferArtwork } from './OfferArtwork';
import { CommerceEmpty, CommerceSearch, DemoPriceNotice } from './CommerceParts';

export function WishlistPage({ deals, wishlist, onRemove, onBrowse, onCompare }: {
  deals: readonly Deal[]; wishlist: readonly string[]; onRemove: (title: string) => void; onBrowse: () => void; onCompare: (title: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const visible = wishlist.filter(title => title.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
    && (availability === 'all' || deals.some(deal => deal.title === title) === (availability === 'offers')));
  const reset = () => { setSearch(''); setAvailability('all'); };
  const remove = (title: string) => {
    onRemove(title);
    // The heading remains mounted when the removed row was the last result.
    headingRef.current?.focus();
  };

  return <div className="commerce-page wishlist-page">
    <header className="commerce-heading"><div><div className="commerce-overline">SUA PRÓXIMA JORNADA</div><h1 ref={headingRef} tabIndex={-1}>Lista de desejos<span aria-hidden="true">.</span></h1><p>Jogos para acompanhar. Sua seleção fica apenas nesta sessão.</p></div>
      <dl className="commerce-summary"><div><dt>Jogos salvos</dt><dd>{wishlist.length}</dd></div><div><dt>Sincronização</dt><dd className="commerce-summary-label">Apenas local</dd></div></dl>
    </header>
    <DemoPriceNotice />
    <div className="wishlist-alert-note"><BellOff size={17} aria-hidden="true" /><strong>Alertas de preço</strong><span>Espaço reservado · Ainda não disponíveis</span></div>
    <section className="commerce-catalog" aria-label="Jogos na lista de desejos">
      {wishlist.length > 0 ? <>
        <div className="commerce-filter-bar"><CommerceSearch value={search} onChange={setSearch} label="Buscar na lista de desejos" placeholder="Buscar nos seus desejos" />
          <label className="commerce-select"><SlidersHorizontal size={15} aria-hidden="true" /><select aria-label="Filtrar disponibilidade demonstrativa" value={availability} onChange={event => setAvailability(event.target.value)}>
            <option value="all">Todos os jogos</option><option value="offers">Com ofertas demo</option><option value="unavailable">Sem ofertas demo</option>
          </select></label>
        </div>
        <div className="commerce-section-heading"><h2><Heart size={16} aria-hidden="true" />Jogos de interesse</h2><span role="status">{visible.length} de {wishlist.length} jogos</span></div>
      </> : null}
      <div className="wishlist-games" role="group" aria-label="Lista de jogos salvos">{visible.map(title => {
        const offers = deals.filter(deal => deal.title === title);
        const lowest = lowestDemoOffer(offers);
        return <article className="wishlist-game" key={title} aria-label={`Desejo: ${title}`}>
          <OfferArtwork title={title} />
          <div className="wishlist-game-copy"><span className="commerce-overline">JOGO FICTÍCIO</span><h2>{title}</h2>
            <p><Layers3 size={14} aria-hidden="true" />{offers.length ? `${offers.length} ofertas demonstrativas` : 'Sem ofertas demonstrativas disponíveis'}</p>
            <small>Disponibilidade real não verificada</small>
          </div>
          <div className="wishlist-game-price"><span>Menor valor ilustrativo</span><strong>{lowest ? formatBRL(lowest.priceBRL) : 'Preço indisponível'}</strong><small>Fictício · Taxas não verificadas</small></div>
          <div className="wishlist-game-actions">{offers.length > 0 && <button className="commerce-button" onClick={() => onCompare(title)}>Comparar ofertas<ArrowRight size={14} aria-hidden="true" /></button>}
            <button className="wishlist-remove" onClick={() => remove(title)} aria-label={`Remover ${title} da lista de desejos`}><Trash2 size={14} aria-hidden="true" />Remover</button>
          </div>
        </article>;
      })}</div>
      {wishlist.length === 0 ? <CommerceEmpty title="Sua lista está vazia" description="Vá até Promoções e clique no coração de um jogo. Seus desejos ficam separados dos favoritos da biblioteca."
        action="Ver promoções" onAction={onBrowse}><Heart size={30} aria-hidden="true" /></CommerceEmpty>
        : !visible.length && <CommerceEmpty title="Nenhum desejo corresponde aos filtros." description="A seleção continua salva nesta sessão. Tente outro nome ou disponibilidade."
          action="Limpar busca e filtros" onAction={reset} />}
    </section>
    <footer className="commerce-footer"><span>Lista em memória · Reinicia ao recarregar · Nenhum alerta é enviado</span><button onClick={onBrowse}>Explorar promoções<ArrowRight size={13} aria-hidden="true" /></button></footer>
  </div>;
}
