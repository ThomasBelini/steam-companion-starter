import { CircleHelp, LockKeyhole, Trophy } from 'lucide-react';
import type { Achievement, Game } from '../types';

function AchievementGroup({ title, items, state }: {
  title: string; items: Achievement[]; state: 'earned' | 'pending' | 'unknown';
}) {
  const Icon = state === 'earned' ? Trophy : state === 'pending' ? LockKeyhole : CircleHelp;
  const label = state === 'earned' ? 'Concluída' : state === 'pending' ? 'Pendente' : 'Indisponível';
  return <section className={`detail-achievement-group is-${state}`} aria-label={title}>
    <div className="detail-group-heading"><h3>{title}</h3><span>{items.length}</span></div>
    <ul>{items.map(item => <li className="detail-achievement" key={item.id}>
      <div className="detail-achievement-icon"><Icon size={20} aria-hidden="true" /></div>
      <div className="detail-achievement-copy"><strong>{item.name}</strong>
        <p>{item.description || (item.hidden ? 'Descrição oculta pelo jogo.' : 'Descrição indisponível.')}</p>
      </div>
      <span className="detail-achievement-state"><Icon size={12} aria-hidden="true" />{label}</span>
    </li>)}</ul>
  </section>;
}

export function AchievementList({ game }: { game: Game }) {
  const earned = game.achievements.filter(item => item.achieved === true);
  const pending = game.achievements.filter(item => item.achieved === false);
  const unknown = game.achievements.filter(item => item.achieved === null);
  const completeData = (!game.achievementsStatus || game.achievementsStatus === 'ready')
    && game.achievements.length > 0 && unknown.length === 0;
  const noAchievements = game.achievementsStatus === 'none';
  const message = noAchievements ? 'Este jogo não possui conquistas.'
    : game.achievementsStatus === 'private-or-unavailable' ? 'Conquistas privadas ou indisponíveis.'
      : game.achievementsStatus === 'not-loaded' ? 'As conquistas ainda não foram carregadas.'
        : game.achievementsStatus === 'unavailable' ? 'As conquistas estão indisponíveis no momento.'
          : game.achievements.length ? 'Dados incompletos. Exibimos somente os estados recebidos; o progresso total é desconhecido.'
            : 'Não há dados suficientes para mostrar as conquistas deste jogo.';

  return <section className="detail-panel detail-achievements" aria-labelledby="game-achievements">
    <div className="detail-panel-heading"><div><span className="detail-eyebrow">CADA CONQUISTA CONTA</span>
      <h2 id="game-achievements" tabIndex={-1}>Conquistas</h2></div>
      {completeData && <span className="detail-count">{earned.length} de {game.achievements.length}</span>}
    </div>
    {!completeData && <div className="detail-data-state" role="status"><CircleHelp size={22} aria-hidden="true" />
      <div><strong>{message}</strong><p>{noAchievements ? 'Não há progresso de conquistas a calcular.' : 'Dados ausentes não significam zero conquistas.'}</p></div>
    </div>}
    {!noAchievements && <>
      {pending.length > 0 && <AchievementGroup title="Pendentes" items={pending} state="pending" />}
      {earned.length > 0 && <AchievementGroup title="Obtidas" items={earned} state="earned" />}
      {unknown.length > 0 && <AchievementGroup title="Status desconhecido" items={unknown} state="unknown" />}
      {completeData && !pending.length && <p className="detail-group-empty">Todas as conquistas foram obtidas. Nada pendente por aqui.</p>}
      {completeData && !earned.length && <p className="detail-group-empty">Nenhuma conquista obtida ainda. Sua jornada está começando.</p>}
    </>}
  </section>;
}
