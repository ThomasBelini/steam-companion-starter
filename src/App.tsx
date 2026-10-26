import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Gamepad2, Heart, LibraryBig, LockKeyhole, Settings2,
  ShieldCheck, Star, Tag,
} from 'lucide-react';
import { DemoLibraryProvider, demoDeals } from './demo';
import { exportGameCard } from './exportImage';
import type { Game, LibraryProvider } from './types';
import { failure, type LibraryResult } from './library/contracts';
import { achievementPercent as percent } from './library/progress';
import { LibraryHome } from './library/LibraryHome';
import { LibraryArtwork } from './library/LibraryArtwork';
import { demoFavoriteAppIds } from './library/demoPresentation';
import { GameDetail } from './game/GameDetail';
import { DealsPage } from './commerce/DealsPage';
import { WishlistPage } from './commerce/WishlistPage';

type Page = 'library' | 'deals' | 'wishlist' | 'profile';
type GameView = 'all' | 'pending' | 'done';

const defaultProvider = new DemoLibraryProvider();
const emptyGames: Game[] = [];
const navItems: { id: Page; title: string; icon: typeof LibraryBig }[] = [
  { id: 'library', title: 'Minha biblioteca', icon: LibraryBig },
  { id: 'deals', title: 'Promoções', icon: Tag },
  { id: 'wishlist', title: 'Lista de desejos', icon: Heart },
  { id: 'profile', title: 'Meu perfil', icon: Settings2 },
];

function App({ libraryProvider = defaultProvider }: { libraryProvider?: LibraryProvider }) {
  const [request, setRequest] = useState<{ provider: LibraryProvider; result: LibraryResult } | null>(null);
  const library = request?.provider === libraryProvider ? request.result : null;
  const games = library?.ok ? library.data.games : emptyGames;
  const isDemo = libraryProvider.source === 'demo';
  const [page, setPage] = useState<Page>('library');
  const [selected, setSelected] = useState<Game | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'hours' | 'progress' | 'name'>('hours');
  const [view, setView] = useState<GameView>('all');
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [dealSearch, setDealSearch] = useState('');
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [favoriteState, setFavoriteState] = useState({ provider: libraryProvider, ids: isDemo ? [...demoFavoriteAppIds] : [] as number[] });
  const favoriteIds = favoriteState.provider === libraryProvider ? favoriteState.ids : [];
  const mainRef = useRef<HTMLElement>(null);
  const navigationRequested = useRef(false);

  useEffect(() => {
    if (!navigationRequested.current) return;
    const heading = mainRef.current?.querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
    navigationRequested.current = false;
  }, [page, selected]);

  useEffect(() => {
    const controller = new AbortController();
    const accept = (result: LibraryResult) => {
      if (!controller.signal.aborted) {
        setRequest({ provider: libraryProvider, result });
        setSelected(null);
      }
    };
    void Promise.resolve().then(() => libraryProvider.getGames(controller.signal))
      .then(accept).catch(() => accept(failure('unavailable')));
    return () => controller.abort();
  }, [libraryProvider]);

  const complete = games.filter(g => percent(g) === 100).length;
  const totalUnlocked = games.reduce((sum, g) => sum + g.achievements.filter(a => a.achieved === true).length, 0);
  const totalAchievements = games.reduce((sum, g) => sum + g.achievements.length, 0);
  const progressUnavailable = games.some(g => percent(g) === null && g.achievementsStatus !== 'none');
  const filtered = useMemo(() => {
    const list = games.filter(g => g.title.toLowerCase().includes(search.toLowerCase()));
    if (view === 'pending') list.splice(0, list.length, ...list.filter(g => { const value = percent(g); return value !== null && value < 100; }));
    if (view === 'done') list.splice(0, list.length, ...list.filter(g => percent(g) === 100));
    return list.sort((a, b) => sort === 'hours' ? (b.totalMinutes ?? -1) - (a.totalMinutes ?? -1) : sort === 'progress' ? (percent(b) ?? -1) - (percent(a) ?? -1) : a.title.localeCompare(b.title));
  }, [games, search, sort, view]);

  const goTo = (target: Page) => { navigationRequested.current = true; setPage(target); setSelected(null); };
  const openGame = (game: Game) => { navigationRequested.current = true; setPage('library'); setSelected(game); };
  const toggleFavorite = (id: number) => setFavoriteState({ provider: libraryProvider,
    ids: favoriteIds.includes(id) ? favoriteIds.filter(item => item !== id) : [...favoriteIds, id] });
  const toggleWishlist = (name: string) => setWishlist(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  const title = selected ? selected.title : page === 'library' ? 'Minha biblioteca' : page === 'deals' ? 'Promoções' : page === 'wishlist' ? 'Lista de desejos' : 'Meu perfil';

  return <div className="shell">
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Gamepad2 size={21} aria-hidden="true" /></div><div><strong>Steam Companion</strong><small>SEU ESPAÇO DE JOGOS</small></div></div>
      <div className="sidebar-group-label">ESPAÇO PESSOAL</div>
      <nav aria-label="Navegação principal">
        {navItems.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'current' : ''}`} aria-current={page === item.id ? 'page' : undefined} title={item.title} onClick={() => goTo(item.id)}><item.icon size={17} aria-hidden="true" /><span className="nav-label">{item.title}</span>{item.id === 'wishlist' && wishlist.length > 0 && <span className="nav-count">{wishlist.length}</span>}</button>)}
      </nav>
      {library?.ok && <div className="sidebar-collection">
        <div className="sidebar-shelf-label"><Star size={12} aria-hidden="true" /><span>FAVORITOS</span><span>{games.filter(game => favoriteIds.includes(game.appid)).length}</span></div>
        <ul>{games.filter(game => favoriteIds.includes(game.appid)).map(game => <li key={game.appid}><button className={`sidebar-game ${selected?.appid === game.appid ? 'is-selected' : ''}`} aria-current={selected?.appid === game.appid ? 'true' : undefined} aria-label={`Abrir ${game.title} pela barra lateral`} onClick={() => openGame(game)}><LibraryArtwork game={game} demo={isDemo} /><span>{game.title}</span></button></li>)}</ul>
        {!favoriteIds.some(id => games.some(game => game.appid === id)) && <p className="sidebar-empty">Nenhum favorito nesta sessão</p>}
        <div className="sidebar-shelf-label"><LibraryBig size={12} aria-hidden="true" /><span>COLEÇÃO COMPLETA</span><span>{games.length}</span></div>
        <ul>{games.map(game => <li key={game.appid}><button className={`sidebar-game ${selected?.appid === game.appid ? 'is-selected' : ''}`} aria-current={selected?.appid === game.appid ? 'true' : undefined} aria-label={`Abrir ${game.title} na coleção`} onClick={() => openGame(game)}><LibraryArtwork game={game} demo={isDemo} /><span>{game.title}</span></button></li>)}</ul>
      </div>}
      <div className="sidebar-bottom"><div className="connected"><span className="status-dot" aria-hidden="true" /><div><strong>{isDemo ? 'Modo demonstração' : 'Biblioteca Steam'}</strong><small>{isDemo ? 'Dados fictícios e locais' : 'Dados via provedor'}</small></div><span className="app-version">0.1.0</span></div><div className="foot-note"><ShieldCheck size={13} aria-hidden="true" /> Nenhuma conta conectada</div></div>
    </aside>

    <main className="main" id="main-content" ref={mainRef} tabIndex={-1}>
      <header className="topbar"><div className="breadcrumb"><span className="topbar-section">BIBLIOTECA</span><ChevronRight size={13} aria-hidden="true" /><strong>{title}</strong></div><div className="right-tags"><span className="pill-demo"><span aria-hidden="true" />PROTÓTIPO · SEM LOGIN</span><button className="icon-button" aria-label="Abrir perfil" title="Perfil — nenhuma conta conectada" onClick={() => goTo('profile')}><Settings2 size={16} aria-hidden="true" /></button></div></header>
      <div className={`content ${page === 'library' ? selected ? 'game-detail-content' : 'library-content' : page === 'deals' || page === 'wishlist' ? 'commerce-content' : ''}`}>
        {selected && library?.ok && page === 'library' ? <GameDetail key={selected.appid}
          game={selected} demo={isDemo} onBack={() => goTo('library')}
          format={format} onFormat={setFormat} onExport={() => exportGameCard(selected, format)}
        /> : page === 'library' && !library?.ok ? <section className="notice" role={library ? 'alert' : 'status'}><p>{library ? library.error.message : 'Carregando biblioteca...'}</p></section> : page === 'library' ? <LibraryHome
          games={games} filtered={filtered} demo={isDemo} incomplete={library?.ok ? library.data.incomplete : false}
          search={search} onSearch={setSearch} view={view} onView={setView} sort={sort} onSort={setSort}
          favoriteIds={favoriteIds} onFavorite={toggleFavorite} onOpen={openGame}
          summary={{ complete, unlocked: totalUnlocked, achievements: totalAchievements, unavailable: progressUnavailable }}
        /> : page === 'deals' ? <DealsPage deals={demoDeals} wishlist={wishlist} search={dealSearch} onSearch={setDealSearch} onToggle={toggleWishlist} />
          : page === 'wishlist' ? <WishlistPage deals={demoDeals} wishlist={wishlist} onRemove={toggleWishlist}
            onBrowse={() => { setDealSearch(''); goTo('deals'); }} onCompare={name => { setDealSearch(name); goTo('deals'); }} />
          : <><div className="heading"><div><div className="eyebrow">SEGURANÇA EM PRIMEIRO LUGAR</div><h1>Minha conta</h1><p>A integração oficial Steam OpenID será feita somente após a validação no backend.</p></div></div><div className="profile-panel"><div className="profile-icon"><LockKeyhole size={36}/></div><h2>Nenhuma conta conectada</h2><p>Este protótipo não pede senha, código Steam Guard, chave da API ou cookies. O login real abrirá o site oficial da Steam no navegador e será verificado por um backend seguro.</p><div className="disabled-button" aria-disabled="true">Entrar com Steam — em desenvolvimento</div><span className="micro">Não existe autenticação fictícia nem credencial armazenada neste protótipo.</span></div></>}
      </div>
    </main>
  </div>;
}

export default App;
