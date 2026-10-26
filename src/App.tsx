import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Download,
  Gamepad2, Heart, LibraryBig, LockKeyhole, Settings2,
  ShieldCheck, ShoppingBag, Star, Tag,
} from 'lucide-react';
import { DemoLibraryProvider, demoDeals } from './demo';
import { exportGameCard } from './exportImage';
import type { Game, LibraryProvider } from './types';
import { failure, type LibraryResult } from './library/contracts';
import { achievementPercent as percent, progressLabel } from './library/progress';
import { LibraryHome } from './library/LibraryHome';
import { LibraryArtwork } from './library/LibraryArtwork';
import { demoFavoriteAppIds } from './library/demoPresentation';

type Page = 'library' | 'deals' | 'wishlist' | 'profile';
type GameView = 'all' | 'pending' | 'done';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const hours = (minutes: number | null) => minutes === null ? 'Tempo indisponível' : `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
const defaultProvider = new DemoLibraryProvider();
const emptyGames: Game[] = [];
const navItems: { id: Page; title: string; icon: typeof LibraryBig }[] = [
  { id: 'library', title: 'Minha biblioteca', icon: LibraryBig },
  { id: 'deals', title: 'Promoções', icon: Tag },
  { id: 'wishlist', title: 'Lista de desejos', icon: Heart },
  { id: 'profile', title: 'Meu perfil', icon: Settings2 },
];

function GameCover({ game, mini = false }: { game: Game; mini?: boolean }) {
  return <div className={`game-cover ${mini ? 'mini' : ''}`} style={{ background: `linear-gradient(145deg, ${game.accent}, #151929 83%)` }} aria-hidden="true">
    <span className="cover-glyph">{game.coverMark}</span>
    <span className="cover-name">{game.title}</span>
  </div>;
}

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
      <div className={`content ${page === 'library' && !selected ? 'library-content' : ''}`}>
        {selected && library?.ok && page === 'library' ? <>
          <button className="back" onClick={() => goTo('library')}><ArrowLeft size={16}/> Voltar para a biblioteca</button>
          <div className="game-detail-header"><GameCover game={selected} mini /><div className="detail-text"><div className="eyebrow">{isDemo ? 'JOGO · DADOS DE EXEMPLO' : 'JOGO · STEAM'}</div><h1>{selected.title}</h1><p>{hours(selected.totalMinutes)} · {progressLabel(selected)}</p><div className="progress-track"><div style={{ width: `${percent(selected) ?? 0}%` }} /></div><div className="export-bar"><span>Exportar cartão:</span><select aria-label="Formato da exportação" value={format} onChange={e => setFormat(e.target.value as 'png' | 'jpeg')}><option value="png">PNG</option><option value="jpeg">JPEG</option></select><button className="primary small" disabled={percent(selected) === null && selected.achievementsStatus !== 'none'} onClick={() => exportGameCard(selected, format)}><Download size={16} /> Exportar</button></div></div></div>
          <div className="section-title"><div><h2>Conquistas</h2><p>As conquistadas e as que faltam para chegar ao 100%</p></div><span className="subtle-badge">{percent(selected) === null ? progressLabel(selected) : `${selected.achievements.filter(a => a.achieved).length} de ${selected.achievements.length}`}</span></div>
          <div className="achievements">{selected.achievements.map(a => <div key={a.id} className="achievement"><div className={`achievement-symbol ${a.achieved ? 'earned' : ''}`}>{a.achieved ? <CheckCircle2 size={23}/> : <LockKeyhole size={23}/>}</div><div className="achievement-copy"><strong>{a.name}</strong><p>{a.description}</p><span className="micro">Dificuldade: {a.estimatedDifficulty} · Guia: {a.guideStatus === 'indisponível' ? 'indisponível' : 'ainda não verificado'}</span></div><span className={`ach-state ${a.achieved ? 'done' : ''}`}>{a.achieved === null ? 'Indisponível' : a.achieved ? 'Concluída' : 'Pendente'}</span></div>)}</div>
          <section className="notice"><BookOpen size={20} /><div><strong>Guias confiáveis serão integrados em uma etapa posterior.</strong><p>{isDemo ? 'Nesta demonstração não há guias nem classificações reais. Não vamos inventar dificuldades ou links não verificados.' : 'Ainda não há guias integrados. Dificuldades permanecem desconhecidas sem uma fonte verificada.'}</p></div></section>
        </> : page === 'library' && !library?.ok ? <section className="notice" role={library ? 'alert' : 'status'}><p>{library ? library.error.message : 'Carregando biblioteca...'}</p></section> : page === 'library' ? <LibraryHome
          games={games} filtered={filtered} demo={isDemo} incomplete={library?.ok ? library.data.incomplete : false}
          search={search} onSearch={setSearch} view={view} onView={setView} sort={sort} onSort={setSort}
          favoriteIds={favoriteIds} onFavorite={toggleFavorite} onOpen={openGame}
          summary={{ complete, unlocked: totalUnlocked, achievements: totalAchievements, unavailable: progressUnavailable }}
        /> : page === 'deals' ? <>
          <div className="heading"><div><div className="eyebrow">COMPARAÇÃO DE PREÇOS</div><h1>Promoções</h1><p>Steam, Nuuvem e Eneba. Sempre conferindo região e preço final.</p></div><span className="subtle-badge"><Tag size={16}/> 3 lojas</span></div>
          <section className="warning"><ShieldCheck size={19}/><div><strong>Preços inteiramente fictícios nesta demonstração.</strong><p>O aplicativo real nunca deve apresentar preço histórico, taxa ou ativação regional sem fontes confiáveis.</p></div></section>
          <div className="deal-list">{demoDeals.map(deal => <div className="deal" key={deal.id}><div className="deal-symbol"><ShoppingBag size={22}/></div><div className="deal-title"><strong>{deal.title}</strong><span>{deal.store} · {deal.historicLowBRL === null ? 'Histórico indisponível' : `Mínimo ilustrativo: ${currency.format(deal.historicLowBRL)}`}</span><small>Taxas e ativação regional não verificadas</small></div><div className="deal-price"><strong>{currency.format(deal.priceBRL)}</strong>{deal.discountPercent !== null && <span>–{deal.discountPercent}% (demo)</span>}</div><button className={`wish-button ${wishlist.includes(deal.title) ? 'saved' : ''}`} onClick={() => toggleWishlist(deal.title)} aria-label={wishlist.includes(deal.title) ? `Remover ${deal.title} da lista de desejos` : `Adicionar ${deal.title} à lista de desejos`}><Heart size={20} fill={wishlist.includes(deal.title) ? 'currentColor' : 'none'}/></button></div>)}</div>
        </> : page === 'wishlist' ? <><div className="heading"><div><div className="eyebrow">JOGOS DE INTERESSE</div><h1>Lista de desejos</h1><p>Uma lista local de demonstração. Ainda não é sincronizada com a Steam.</p></div></div>{wishlist.length ? <div className="deal-list">{wishlist.map(name => <div className="deal" key={name}><div className="deal-symbol"><Star size={20}/></div><div className="deal-title"><strong>{name}</strong><span>Adicionado manualmente no protótipo</span></div><button className="ghost" onClick={() => toggleWishlist(name)}>Remover</button></div>)}</div> : <div className="empty"><Heart size={34}/><h2>Sua lista está vazia</h2><p>Vá até Promoções e clique no coração de um jogo.</p><button className="primary" onClick={() => goTo('deals')}>Ver promoções <ArrowRight size={16}/></button></div>}</> : <><div className="heading"><div><div className="eyebrow">SEGURANÇA EM PRIMEIRO LUGAR</div><h1>Minha conta</h1><p>A integração oficial Steam OpenID será feita somente após a validação no backend.</p></div></div><div className="profile-panel"><div className="profile-icon"><LockKeyhole size={36}/></div><h2>Nenhuma conta conectada</h2><p>Este protótipo não pede senha, código Steam Guard, chave da API ou cookies. O login real abrirá o site oficial da Steam no navegador e será verificado por um backend seguro.</p><div className="disabled-button" aria-disabled="true">Entrar com Steam — em desenvolvimento</div><span className="micro">Não existe autenticação fictícia nem credencial armazenada neste protótipo.</span></div></>}
      </div>
    </main>
  </div>;
}

export default App;
