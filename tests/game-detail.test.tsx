import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GameDetail } from '../src/game/GameDetail';
import { demoGames } from '../src/demo';
import type { Game } from '../src/types';

function show(game: Game = demoGames[0], demo = true, onExport = vi.fn()) {
  return render(<GameDetail game={game} demo={demo} onBack={vi.fn()} format="png" onFormat={vi.fn()} onExport={onExport} />);
}

describe('página individual — dados e apresentação', () => {
  it('separa conquistas obtidas e pendentes e mantém descrições e progresso', () => {
    show();
    expect(within(screen.getByRole('region', { name: 'Pendentes' })).getAllByRole('listitem')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Obtidas' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Encontre a rota secreta.')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Dados fictícios e locais')).toBeVisible();
  });

  it('destaca 100% somente para um jogo totalmente conhecido e concluído', () => {
    show(demoGames[1]);
    expect(screen.getByText('100% concluído')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Pendentes' })).not.toBeInTheDocument();
    expect(screen.getByText('Todas as conquistas foram obtidas. Nada pendente por aqui.')).toBeVisible();
  });

  it('preserva zero conhecido sem chamá-lo de desconhecido', () => {
    show(demoGames[3]);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('Nenhuma conquista obtida ainda. Sua jornada está começando.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeEnabled();
  });

  it.each(['not-loaded', 'unavailable', 'private-or-unavailable', 'incomplete', 'ready', undefined] as const)(
    'não converte lista ausente (%s) em zero nem permite exportação', status => {
      show({ ...demoGames[0], source: 'steam', totalMinutes: null, achievementsStatus: status, achievements: [] }, false);
      expect(screen.getByRole('status')).toHaveTextContent('Dados ausentes não significam zero conquistas.');
      expect(screen.getByText('Tempo indisponível')).toBeVisible();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByText('0% completo')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Exportar' })).toBeDisabled();
      expect(screen.queryByText('100% concluído')).not.toBeInTheDocument();
    });

  it('distingue um jogo comprovadamente sem conquistas', () => {
    show({ ...demoGames[0], achievementsStatus: 'none', achievements: [] });
    expect(screen.getByRole('status')).toHaveTextContent('Este jogo não possui conquistas.');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeEnabled();
  });

  it('não apresenta conquistas desconhecidas como pendentes, nem lista parcial como 100%', () => {
    show({ ...demoGames[0], achievementsStatus: 'incomplete', achievements: [
      demoGames[0].achievements[0], { ...demoGames[0].achievements[1], achieved: null },
    ] });
    expect(within(screen.getByRole('region', { name: 'Obtidas' })).getAllByRole('listitem')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Status desconhecido' })).getByText('Indisponível')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Pendentes' })).not.toBeInTheDocument();
    expect(screen.queryByText('100% concluído')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('usa descrição alternativa sem inventar detalhes de uma conquista oculta', () => {
    show({ ...demoGames[0], achievements: [{ ...demoGames[0].achievements[0], description: '', hidden: true }] });
    expect(screen.getByText('Descrição oculta pelo jogo.')).toBeVisible();
  });

  it.each(['incomplete', 'unavailable'] as const)('não declara 100%% quando todas as conquistas recebidas estão obtidas, mas o estado é %s', status => {
    show({ ...demoGames[1], achievementsStatus: status });
    expect(screen.queryByText('100% concluído')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeDisabled();
    expect(screen.getByRole('status')).toBeVisible();
  });

  it('não atribui artes ou gênero demo ao provedor por coincidência de AppID', () => {
    const { container } = show({ ...demoGames[0], source: 'steam' }, false);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('Exploração espacial')).not.toBeInTheDocument();
  });

  it('reserva guias sem links, dificuldades ou tempos inventados', () => {
    show();
    const guides = screen.getByRole('region', { name: 'Guias e recomendações' });
    expect(within(guides).queryByRole('link')).not.toBeInTheDocument();
    expect(within(guides).getByText('Desconhecida')).toBeVisible();
    expect(within(guides).getByText('Não disponível')).toBeVisible();
    expect(within(guides).getByText('Ainda indisponíveis')).toBeVisible();
  });

  it('informa falha de exportação sem expor a exceção e permite tentar novamente', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockImplementationOnce(() => { throw new Error('internal canvas error'); });
    show(demoGames[0], true, save);
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível exportar a imagem.');
    expect(screen.queryByText(/internal canvas/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
