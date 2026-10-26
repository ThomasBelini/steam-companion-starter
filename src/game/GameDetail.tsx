import { ArrowLeft, ArrowUpRight, BookOpen, Check, Clock3, ShieldCheck, Trophy } from 'lucide-react';
import type { Game } from '../types';
import { LibraryArtwork } from '../library/LibraryArtwork';
import { demoArtwork } from '../library/demoPresentation';
import { achievementPercent, progressLabel } from '../library/progress';
import { AchievementList } from './AchievementList';
import { GameExport } from './GameExport';

type Props = {
  game: Game; demo: boolean; onBack: () => void;
  format: 'png' | 'jpeg'; onFormat: (format: 'png' | 'jpeg') => void; onExport: () => void;
};

export function GameDetail({ game, demo, onBack, format, onFormat, onExport }: Props) {
  const progress = achievementPercent(game);
  const earned = game.achievements.filter(item => item.achieved === true).length;
  const complete = progress === 100;
  const hours = game.totalMinutes === null ? 'Tempo indisponível'
    : `${(game.totalMinutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;

  return <article className="game-detail" aria-labelledby="game-title">
    <div className="detail-path"><button onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />Voltar para a biblioteca</button>
      <span>{demo ? 'JOGO FICTÍCIO · DEMONSTRAÇÃO' : 'BIBLIOTECA VIA PROVEDOR'}</span></div>
    <header className="detail-hero" aria-label="Apresentação do jogo">
      <LibraryArtwork game={game} demo={demo} className="detail-panorama" />
      <div className="detail-hero-shade" />
      <div className="detail-hero-body">
        <div className="detail-cover"><LibraryArtwork game={game} demo={demo} /><span aria-hidden="true">{game.title}</span></div>
        <div className="detail-hero-copy"><span className="detail-eyebrow">{demo ? 'COMPANION ORIGINAL' : 'SUA BIBLIOTECA'}</span>
          <h1 id="game-title">{game.title}</h1>
          <p>{demo ? demoArtwork[game.appid]?.genre ?? 'Jogo demonstrativo' : 'Informações recebidas pelo provedor'}</p>
          <div className="detail-hero-label"><ShieldCheck size={14} aria-hidden="true" />{demo ? 'Dados fictícios e locais' : 'Nenhuma conta conectada neste protótipo'}</div>
        </div>
      </div>
      {complete && <span className="detail-completed"><Trophy size={14} aria-hidden="true" />100% concluído</span>}
    </header>

    <section className="detail-toolbar" id="game-overview" aria-label="Informações gerais" tabIndex={-1}>
      <dl className="detail-stats"><div><dt><Clock3 size={15} aria-hidden="true" />Tempo jogado</dt><dd>{hours}</dd></div>
        <div><dt><Trophy size={15} aria-hidden="true" />Conquistas</dt><dd>{progress !== null ? <>{earned}<span> / {game.achievements.length}</span></> : '—'}</dd></div>
        <div><dt>Progresso</dt><dd className="detail-progress-value">{progressLabel(game)}</dd></div>
      </dl>
      <GameExport format={format} onFormat={onFormat} onExport={onExport} disabled={progress === null && game.achievementsStatus !== 'none'} />
    </section>
    <nav className="detail-nav" aria-label="Seções do jogo">
      <a href="#game-overview">Informações gerais</a><a href="#game-achievements">Conquistas</a><a href="#game-guides">Guias</a>
    </nav>

    <div className="detail-columns">
      <AchievementList game={game} />
      <aside className="detail-aside" aria-label="Progresso e guias">
        <section className="detail-panel detail-progress-panel" aria-labelledby="game-progress-heading">
          <div className="detail-panel-heading"><h2 id="game-progress-heading">Seu progresso</h2><Trophy size={16} aria-hidden="true" /></div>
          <div className="detail-progress-number">{progress === null ? '—' : <>{progress}<span>%</span></>}</div>
          <p>{progress === null ? progressLabel(game) : complete ? 'Todas as conquistas obtidas.' : `${earned} de ${game.achievements.length} conquistas obtidas.`}</p>
          {progress !== null && <div className="detail-progress-track" role="progressbar" aria-label={`Progresso de ${game.title}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>}
          {progress !== null && <div className="detail-achievement-marks" aria-hidden="true">{game.achievements.slice(0, 8).map(item => <span className={item.achieved ? 'is-earned' : ''} key={item.id}>{item.achieved ? <Check size={17} /> : <Trophy size={17} />}</span>)}</div>}
          <span className="detail-panel-note">{demo ? 'PROGRESSO DEMONSTRATIVO' : 'DADOS DO PROVEDOR'}</span>
        </section>
        <section className="detail-panel detail-guides" aria-labelledby="game-guides">
          <div className="detail-panel-heading"><h2 id="game-guides" tabIndex={-1}>Guias e recomendações</h2><BookOpen size={17} aria-hidden="true" /></div>
          <div className="detail-guide-placeholder"><BookOpen size={25} aria-hidden="true" /><strong>Seu próximo passo, com fontes confiáveis.</strong>
            <p>Guias confiáveis serão integrados em uma etapa posterior.</p>
          </div>
          <div className="detail-guide-facts"><span>Guias verificados <span>Ainda indisponíveis</span></span><span>Dificuldade <span>Desconhecida</span></span><span>Tempo estimado <span>Não disponível</span></span></div>
          <p className="detail-guide-disclaimer">{demo ? 'Sem recomendações reais nesta demonstração.' : 'Nenhuma fonte de guias integrada.'} Não inferimos dificuldade pela raridade.</p>
        </section>
      </aside>
    </div>
    <footer className="detail-footer"><span>{demo ? 'Artes originais · Dados fictícios · Nenhuma conta conectada' : 'Sem consulta Steam direta nesta interface'}</span><a href="#game-overview">Voltar ao resumo <ArrowUpRight size={13} aria-hidden="true" /></a></footer>
  </article>;
}
