import { useState } from 'react';
import { ArrowRight, Check, Clock3, Filter, LayoutGrid, Search, Star, Trophy } from 'lucide-react';
import type { Game } from '../types';
import { achievementPercent, progressLabel } from './progress';
import { demoArtwork, demoRecentAppIds } from './demoPresentation';
import { LibraryArtwork } from './LibraryArtwork';

type Props = {
  games: Game[];
  filtered: Game[];
  demo: boolean;
  incomplete: boolean;
  search: string;
  onSearch: (value: string) => void;
  view: 'all' | 'pending' | 'done';
  onView: (value: Props['view']) => void;
  sort: 'hours' | 'progress' | 'name';
  onSort: (value: Props['sort']) => void;
  favoriteIds: number[];
  onFavorite: (id: number) => void;
  onOpen: (game: Game) => void;
  summary: { complete: number; unlocked: number; achievements: number; unavailable: boolean };
};

const hours = (minutes: number | null) => minutes === null ? 'Tempo indisponível'
  : `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

export function LibraryHome(props: Props) {
  const { games, filtered, demo, incomplete, search, onSearch, view, onView, sort, onSort,
    favoriteIds, onFavorite, onOpen, summary } = props;
  const [featuredId, setFeaturedId] = useState<number>(demoRecentAppIds[0]);
  const filtering = search !== '' || view !== 'all';
  const recent = demo ? demoRecentAppIds.flatMap(id => games.filter(game => game.appid === id)) : [];
  const featured = recent.find(game => game.appid === featuredId) ?? recent[0];
  const favorites = games.filter(game => favoriteIds.includes(game.appid));

  return <div className="library-home">
    <div className="library-heading">
      <div><div className="library-overline">SEU ESPAÇO DE JOGOS</div><h1>Minha biblioteca<span className="heading-period" aria-hidden="true">.</span></h1></div>
      <dl className="library-summary">
        <div><dt>Jogos na biblioteca</dt><dd>{games.length}</dd></div>
        <div><dt>Conquistas obtidas</dt><dd>{summary.unavailable ? '—' : <>{summary.unlocked}<span> / {summary.achievements}</span></>}</dd></div>
        <div><dt>Jogos 100%</dt><dd>{summary.unavailable ? '—' : summary.complete}</dd></div>
      </dl>
    </div>
    {incomplete && <section className="library-message" role="status">Biblioteca incompleta: alguns dados não foram retornados pela Steam.</section>}

    {!filtering && featured && <section className="recent-shelf" aria-labelledby="recent-heading">
      <div className="shelf-heading"><h2 id="recent-heading">Jogos recentes</h2><span>SELEÇÃO ILUSTRATIVA · DEMO</span><div className="shelf-rule" /></div>
      <div className="recent-banner">
        <LibraryArtwork game={featured} demo={demo} className="banner-art" />
        <div className="banner-shade" />
        <div className="banner-copy">
          <span className="banner-kicker">REDESCUBRA SUA BIBLIOTECA</span>
          <h3>{featured.title}</h3>
          <p>{demoArtwork[featured.appid]?.genre} <span>· Jogo fictício</span></p>
          <button className="banner-action" onClick={() => onOpen(featured)}>Ver conquistas <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        <div className="banner-index" aria-hidden="true">{String(recent.indexOf(featured) + 1).padStart(2, '0')} <span>/ {String(recent.length).padStart(2, '0')}</span></div>
      </div>
      <div className="recent-selector" aria-label="Seleção ilustrativa de jogos recentes">
        {recent.map(game => <button key={game.appid} className={`recent-choice ${game.appid === featured.appid ? 'is-selected' : ''}`}
          aria-label={`Destacar ${game.title}`} aria-pressed={game.appid === featured.appid} onClick={() => setFeaturedId(game.appid)}>
          <LibraryArtwork game={game} demo={demo} />
          <span><strong>{game.title}</strong><small>{hours(game.totalMinutes)} <span aria-hidden="true">·</span> {progressLabel(game)}</small></span>
          {game.appid === featured.appid && <span className="recent-indicator" aria-hidden="true" />}
        </button>)}
      </div>
    </section>}

    {!filtering && <section className="favorites-shelf" aria-labelledby="favorites-heading">
      <div className="shelf-heading"><Star size={14} aria-hidden="true" /><h2 id="favorites-heading">Favoritos</h2><span className="shelf-count">{favorites.length}</span><div className="shelf-rule" /><span>APENAS NESTA SESSÃO</span></div>
      {favorites.length ? <div className="favorite-grid">{favorites.map(game => <div key={game.appid} className="favorite-game">
        <button className="favorite-open" aria-label={`Abrir favorito: ${game.title}`} onClick={() => onOpen(game)}>
          <LibraryArtwork game={game} demo={demo} />
          <span><strong>{game.title}</strong><small>{progressLabel(game)}</small></span>
        </button>
        <button className="favorite-remove" aria-label={`Remover ${game.title} dos favoritos`} aria-pressed="true" onClick={() => onFavorite(game.appid)}><Star size={14} fill="currentColor" aria-hidden="true" /></button>
      </div>)}</div> : <div className="favorites-empty"><Star size={18} aria-hidden="true" /><p>Seus jogos favoritos, sempre por perto.<span>Marque a estrela de uma capa para adicionar um jogo.</span></p></div>}
    </section>}

    <section className="all-games-shelf" aria-labelledby="all-games-heading">
      <div className="shelf-heading"><LayoutGrid size={14} aria-hidden="true" /><h2 id="all-games-heading">Todos os jogos</h2><span className="shelf-count">{games.length}</span><div className="shelf-rule" /><span className="result-count" aria-live="polite" aria-atomic="true">{filtered.length} resultados</span></div>
      <div className="library-filters">
        <label className="library-search"><Search size={16} aria-hidden="true" /><input type="text" value={search} onChange={e => onSearch(e.target.value)} placeholder="Buscar na biblioteca" aria-label="Buscar jogo" /></label>
        <label className="library-select"><Filter size={14} aria-hidden="true" /><select value={view} onChange={e => onView(e.target.value as Props['view'])} aria-label="Filtrar jogos"><option value="all">Todos os jogos</option><option value="pending">Incompletos</option><option value="done">100% concluídos</option></select></label>
        <label className="library-select"><span>ORDENAR</span><select value={sort} onChange={e => onSort(e.target.value as Props['sort'])} aria-label="Ordenar jogos"><option value="hours">Mais jogados</option><option value="progress">Mais completos</option><option value="name">Nome A–Z</option></select></label>
      </div>
      <div className="game-grid library-game-grid">{filtered.map(game => {
        const progress = achievementPercent(game);
        const favorite = favoriteIds.includes(game.appid);
        return <article className="library-game" key={game.appid}>
          <button className="game-card library-card" aria-label={`${game.title} ${hours(game.totalMinutes)} ${progressLabel(game)}`} onClick={() => onOpen(game)}>
            <div className="poster">
              <LibraryArtwork game={game} demo={demo} />
              <div className="poster-shade" />
              <span className="poster-edition">{demo ? 'COMPANION ORIGINAL' : 'BIBLIOTECA'}</span>
              <span className="poster-title">{game.title}</span>
              {progress === 100 && <span className="poster-complete"><Check size={11} aria-hidden="true" /> 100%</span>}
            </div>
            <div className="library-card-copy"><strong>{game.title}</strong><div className="library-card-meta"><span><Clock3 size={12} aria-hidden="true" />{hours(game.totalMinutes)}</span><span><Trophy size={12} aria-hidden="true" />{progress === null ? '—' : `${game.achievements.filter(a => a.achieved === true).length}/${game.achievements.length}`}</span></div>
              {progress !== null && <div className="library-progress" role="progressbar" aria-label={`Conquistas de ${game.title}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>}
              <small>{progressLabel(game)}</small>
            </div>
          </button>
          <button className={`favorite-toggle ${favorite ? 'is-favorite' : ''}`} aria-label={favorite ? `Desfavoritar ${game.title}` : `Adicionar ${game.title} aos favoritos`}
            aria-pressed={favorite} onClick={() => onFavorite(game.appid)}><Star size={15} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
        </article>;
      })}</div>
      {!filtered.length && <div className="library-empty"><Search size={24} aria-hidden="true" /><h3>Nenhum jogo corresponde aos filtros.</h3><p>{games.length ? 'Tente outro nome ou ajuste os filtros da sua biblioteca.' : 'Sua biblioteca está vazia. Os jogos aparecerão aqui quando estiverem disponíveis.'}</p>{filtering && <button onClick={() => { onSearch(''); onView('all'); }}>Limpar busca e filtros</button>}</div>}
    </section>
    <footer className="library-footer"><span>{demo ? 'Biblioteca fictícia · Artes originais · Nenhuma conta conectada' : 'Biblioteca via provedor · Sem consulta Steam direta'}</span><span>STEAM COMPANION</span></footer>
  </div>;
}
