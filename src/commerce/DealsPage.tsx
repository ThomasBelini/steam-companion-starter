import { useState } from 'react';
import { Heart, SlidersHorizontal, Tag } from 'lucide-react';
import type { Deal } from '../types';
import { groupDemoOffers } from './demoOffers';
import { OfferComparison } from './OfferComparison';
import { CommerceEmpty, CommerceSearch, DemoPriceNotice } from './CommerceParts';

export function DealsPage({ deals, wishlist, search, onSearch, onToggle }: {
  deals: readonly Deal[]; wishlist: readonly string[]; search: string; onSearch: (value: string) => void; onToggle: (title: string) => void;
}) {
  const [store, setStore] = useState('all');
  const [onlyWishes, setOnlyWishes] = useState(false);
  const stores = [...new Set(deals.map(deal => deal.store))];
  const groups = groupDemoOffers(deals.filter(deal => deal.title.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
    && (store === 'all' || deal.store === store) && (!onlyWishes || wishlist.includes(deal.title))));
  const offerCount = groups.reduce((count, group) => count + group.offers.length, 0);
  const filtered = search !== '' || store !== 'all' || onlyWishes;
  const reset = () => { onSearch(''); setStore('all'); setOnlyWishes(false); };

  return <div className="commerce-page deals-page">
    <header className="commerce-heading"><div><div className="commerce-overline">COMPARE COM CLAREZA</div><h1>Promoções<span aria-hidden="true">.</span></h1><p>Seus próximos jogos, lado a lado. Apenas valores demonstrativos.</p></div>
      <dl className="commerce-summary"><div><dt>Jogos</dt><dd>{groupDemoOffers(deals).length}</dd></div><div><dt>Ofertas demo</dt><dd>{deals.length}</dd></div><div><dt>Lojas</dt><dd>{stores.length}</dd></div></dl>
    </header>
    <DemoPriceNotice />
    <section className="commerce-catalog" aria-label="Comparação de ofertas demonstrativas">
      <div className="commerce-filter-bar"><CommerceSearch value={search} onChange={onSearch} label="Buscar em promoções" placeholder="Buscar jogo nas ofertas" />
        <label className="commerce-select"><SlidersHorizontal size={15} aria-hidden="true" /><select aria-label="Filtrar por loja" value={store} onChange={event => setStore(event.target.value)}>
          <option value="all">Todas as lojas</option>{stores.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label className={`commerce-wishes-filter ${onlyWishes ? 'is-selected' : ''}`}><input type="checkbox" checked={onlyWishes} onChange={event => setOnlyWishes(event.target.checked)} /><Heart size={15} aria-hidden="true" />Apenas desejos</label>
      </div>
      <div className="commerce-section-heading"><h2><Tag size={16} aria-hidden="true" />Ofertas por jogo</h2><span role="status">{groups.length} jogos · {offerCount} ofertas exibidas</span></div>
      <div className="offer-grid">{groups.map(group => <OfferComparison key={group.title} title={group.title} offers={group.offers}
        total={deals.filter(deal => deal.title === group.title).length} saved={wishlist.includes(group.title)} onToggle={onToggle} />)}</div>
      {!groups.length && <CommerceEmpty title={deals.length ? 'Nenhuma oferta corresponde aos filtros.' : 'Nenhuma oferta demonstrativa disponível.'}
        description={filtered ? 'Tente outro nome, escolha outra loja ou ajuste o filtro de desejos.' : 'As ofertas aparecerão aqui quando houver dados demonstrativos disponíveis.'}
        action={filtered ? 'Limpar busca e filtros' : undefined} onAction={filtered ? reset : undefined} />}
      <p className="commerce-catalog-note">A comparação considera os filtros selecionados. Menor valor exibido não significa menor preço final, histórico confiável ou ativação confirmada.</p>
    </section>
    <footer className="commerce-footer"><span>Preços fictícios · Sem consulta externa · Nenhuma compra é realizada</span><span>STEAM COMPANION</span></footer>
  </div>;
}
