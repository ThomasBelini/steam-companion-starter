import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, Download, Filter,
  Gamepad2, Heart, LayoutGrid, LibraryBig, LockKeyhole, Search, Settings2,
  ShieldCheck, ShoppingBag, Star, Tag, Trophy,
} from 'lucide-react';
import { demoGames, demoDeals } from './demo';
import { exportGameCard } from './exportImage';
import type { Game } from './types';

type Page = 'library' | 'deals' | 'wishlist' | 'profile';
type GameView = 'all' | 'pending' | 'done';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = (game: Game) => game.achievements.length ? Math.round(game.achievements.filter(a => a.achieved).length / game.achievements.length * 100) : 0;
const hours = (minutes: number) => `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
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

function App() {
  const [page, setPage] = useState<Page>('library');
  const [selected, setSelected] = useState<Game | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'hours' | 'progress' | 'name'>('hours');
  const [view, setView] = useState<GameView>('all');
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');

  const complete = demoGames.filter(g => percent(g) === 100).length;
  const totalUnlocked = demoGames.reduce((sum, g) => sum + g.achievements.filter(a => a.achieved).length, 0);
  const totalAchievements = demoGames.reduce((sum, g) => sum + g.achievements.length, 0);
  const filtered = useMemo(() => {
    const list = demoGames.filter(g => g.title.toLowerCase().includes(search.toLowerCase()));
    if (view === 'pending') list.splice(0, list.length, ...list.filter(g => percent(g) < 100));
    if (view === 'done') list.splice(0, list.length, ...list.filter(g => percent(g) === 100));
    return list.sort((a, b) => sort === 'hours' ? b.totalMinutes - a.totalMinutes : sort === 'progress' ? percent(b) - percent(a) : a.title.localeCompare(b.title));
  }, [search, sort, view]);

  const goTo = (target: Page) => { setPage(target); setSelected(null); };
  const toggleWishlist = (name: string) => setWishlist(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  const title = selected ? selected.title : page === 'library' ? 'Minha biblioteca' : page === 'deals' ? 'Promoções' : page === 'wishlist' ? 'Lista de desejos' : 'Meu perfil';

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Trophy size={22} /></div><div><strong>Steam Companion</strong><small>Seu guia rumo aos 100%</small></div></div>
      <div className="sidebar-group-label">EXPLORAR</div>
      <nav aria-label="Navegação principal">
        {navItems.map(item => <button key={item.id} className={`nav-item ${page === item.id && !selected ? 'current' : ''}`} onClick={() => goTo(item.id)}><item.icon size={19} />{item.title}{item.id === 'wishlist' && wishlist.length > 0 && <span className="nav-count">{wishlist.length}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="connected"><span className="status-dot" /><div><strong>Modo demonstração</strong><small>Dados fictícios e locais</small></div></div><div className="foot-note"><ShieldCheck size={17} /> Nenhuma conta conectada</div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb"><span>Steam Companion</span><span>/</span><strong>{title}</strong></div><div className="right-tags"><span className="pill-demo">PROTÓTIPO · SEM LOGIN</span><button className="icon-button" aria-label="Abrir perfil" onClick={() => goTo('profile')}><Settings2 size={18} /></button></div></header>
      <div className="content">
        {selected && page === 'library' ? <>
          <button className="back" onClick={() => setSelected(null)}><ArrowLeft size={16}/> Voltar para a biblioteca</button>
          <div className="game-detail-header"><GameCover game={selected} mini /><div className="detail-text"><div className="eyebrow">JOGO · DADOS DE EXEMPLO</div><h1>{selected.title}</h1><p>{hours(selected.totalMinutes)} jogadas · {percent(selected)}% de conquistas concluídas</p><div className="progress-track"><div style={{ width: `${percent(selected)}%` }} /></div><div className="export-bar"><span>Exportar cartão:</span><select aria-label="Formato da exportação" value={format} onChange={e => setFormat(e.target.value as 'png' | 'jpeg')}><option value="png">PNG</option><option value="jpeg">JPEG</option></select><button className="primary small" onClick={() => exportGameCard(selected, format)}><Download size={16} /> Exportar</button></div></div></div>
          <div className="section-title"><div><h2>Conquistas</h2><p>As conquistadas e as que faltam para chegar ao 100%</p></div><span className="subtle-badge">{selected.achievements.filter(a => a.achieved).length} de {selected.achievements.length}</span></div>
          <div className="achievements">{selected.achievements.map(a => <div key={a.id} className="achievement"><div className={`achievement-symbol ${a.achieved ? 'earned' : ''}`}>{a.achieved ? <CheckCircle2 size={23}/> : <LockKeyhole size={23}/>}</div><div className="achievement-copy"><strong>{a.name}</strong><p>{a.description}</p><span className="micro">Dificuldade: {a.estimatedDifficulty} · Guia: {a.guideStatus === 'indisponível' ? 'indisponível' : 'ainda não verificado'}</span></div><span className={`ach-state ${a.achieved ? 'done' : ''}`}>{a.achieved ? 'Concluída' : 'Pendente'}</span></div>)}</div>
          <section className="notice"><BookOpen size={20} /><div><strong>Guias confiáveis serão integrados em uma etapa posterior.</strong><p>Nesta demonstração não há guias nem classificações reais. Não vamos inventar dificuldades ou links não verificados.</p></div></section>
        </> : page === 'library' ? <>
          <div className="heading"><div><div className="eyebrow">SEUS JOGOS, SEU PROGRESSO</div><h1>Minha biblioteca</h1><p>Acompanhe tudo em um só lugar e escolha a próxima conquista.</p></div><span className="subtle-badge"><Gamepad2 size={16}/> Steam (demo)</span></div>
          <div className="stats"><div className="stat"><div className="stat-icon purple"><LibraryBig size={21}/></div><span>Jogos na biblioteca</span><strong>{demoGames.length}</strong><small>Biblioteca fictícia</small></div><div className="stat"><div className="stat-icon blue"><Trophy size={21}/></div><span>Conquistas obtidas</span><strong>{totalUnlocked} <em>/ {totalAchievements}</em></strong><small>Em todos os jogos</small></div><div className="stat"><div className="stat-icon green"><CheckCircle2 size={21}/></div><span>Jogos 100%</span><strong>{complete}</strong><small>Completados</small></div></div>
          <div className="section-title"><div><h2>Todos os jogos</h2><p>Ordene, filtre e explore as conquistas</p></div><span className="subtle-badge">{filtered.length} resultados</span></div>
          <div className="filters"><label className="searchbox"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar jogo..." aria-label="Buscar jogo" /></label><label className="selectbox"><Filter size={17}/><select value={view} onChange={e => setView(e.target.value as GameView)} aria-label="Filtrar jogos"><option value="all">Todos</option><option value="pending">Incompletos</option><option value="done">100% concluídos</option></select></label><label className="selectbox"><LayoutGrid size={17}/><select value={sort} onChange={e => setSort(e.target.value as 'hours' | 'progress' | 'name')} aria-label="Ordenar jogos"><option value="hours">Mais jogados</option><option value="progress">Mais completos</option><option value="name">Nome A–Z</option></select></label></div>
          <div className="game-grid">{filtered.map(game => <button key={game.appid} className="game-card" onClick={() => setSelected(game)}><GameCover game={game}/><div className="game-card-body"><strong>{game.title}</strong><div className="game-meta"><span><Clock3 size={14}/>{hours(game.totalMinutes)}</span><span><Trophy size={14}/>{game.achievements.filter(a => a.achieved).length}/{game.achievements.length}</span></div><div className="progress-line"><div style={{ width: `${percent(game)}%` }}/></div><div className="game-card-footer"><span>{percent(game)}% completo</span><ArrowRight size={16}/></div></div></button>)}</div>
          {!filtered.length && <div className="empty">Nenhum jogo corresponde aos filtros.</div>}
        </> : page === 'deals' ? <>
          <div className="heading"><div><div className="eyebrow">COMPARAÇÃO DE PREÇOS</div><h1>Promoções</h1><p>Steam, Nuuvem e Eneba. Sempre conferindo região e preço final.</p></div><span className="subtle-badge"><Tag size={16}/> 3 lojas</span></div>
          <section className="warning"><ShieldCheck size={19}/><div><strong>Preços inteiramente fictícios nesta demonstração.</strong><p>O aplicativo real nunca deve apresentar preço histórico, taxa ou ativação regional sem fontes confiáveis.</p></div></section>
          <div className="deal-list">{demoDeals.map(deal => <div className="deal" key={deal.id}><div className="deal-symbol"><ShoppingBag size={22}/></div><div className="deal-title"><strong>{deal.title}</strong><span>{deal.store} · {deal.historicLowBRL === null ? 'Histórico indisponível' : `Mínimo ilustrativo: ${currency.format(deal.historicLowBRL)}`}</span><small>Taxas e ativação regional não verificadas</small></div><div className="deal-price"><strong>{currency.format(deal.priceBRL)}</strong>{deal.discountPercent !== null && <span>–{deal.discountPercent}% (demo)</span>}</div><button className={`wish-button ${wishlist.includes(deal.title) ? 'saved' : ''}`} onClick={() => toggleWishlist(deal.title)} aria-label={wishlist.includes(deal.title) ? `Remover ${deal.title} da lista de desejos` : `Adicionar ${deal.title} à lista de desejos`}><Heart size={20} fill={wishlist.includes(deal.title) ? 'currentColor' : 'none'}/></button></div>)}</div>
        </> : page === 'wishlist' ? <><div className="heading"><div><div className="eyebrow">JOGOS DE INTERESSE</div><h1>Lista de desejos</h1><p>Uma lista local de demonstração. Ainda não é sincronizada com a Steam.</p></div></div>{wishlist.length ? <div className="deal-list">{wishlist.map(name => <div className="deal" key={name}><div className="deal-symbol"><Star size={20}/></div><div className="deal-title"><strong>{name}</strong><span>Adicionado manualmente no protótipo</span></div><button className="ghost" onClick={() => toggleWishlist(name)}>Remover</button></div>)}</div> : <div className="empty"><Heart size={34}/><h2>Sua lista está vazia</h2><p>Vá até Promoções e clique no coração de um jogo.</p><button className="primary" onClick={() => goTo('deals')}>Ver promoções <ArrowRight size={16}/></button></div>}</> : <><div className="heading"><div><div className="eyebrow">SEGURANÇA EM PRIMEIRO LUGAR</div><h1>Minha conta</h1><p>A integração oficial Steam OpenID será feita somente após a validação no backend.</p></div></div><div className="profile-panel"><div className="profile-icon"><LockKeyhole size={36}/></div><h2>Nenhuma conta conectada</h2><p>Este protótipo não pede senha, código Steam Guard, chave da API ou cookies. O login real abrirá o site oficial da Steam no navegador e será verificado por um backend seguro.</p><div className="disabled-button" aria-disabled="true">Entrar com Steam — em desenvolvimento</div><span className="micro">Não existe autenticação fictícia nem credencial armazenada neste protótipo.</span></div></>}
      </div>
    </main>
  </div>;
}

export default App;
