import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import type { Game, LibraryProvider } from '../src/types';
import { failure, type LibraryResult } from '../src/library/contracts';
import { achievementPercent, progressLabel } from '../src/library/progress';

const pendingGame: Game = {
  appid: 101, title: 'Jogo via provedor de teste', totalMinutes: null, source: 'steam',
  achievements: [], achievementsStatus: 'not-loaded', accent: '#123456', coverMark: 'T',
};
const provider = (result: LibraryResult): LibraryProvider => ({ source: 'steam', getGames: vi.fn().mockResolvedValue(result) });

describe('interface desacoplada da origem da biblioteca', () => {
  it('exibe carregamento antes da resposta', () => {
    render(<App libraryProvider={{ source: 'steam', getGames: () => new Promise(() => {}) }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando biblioteca');
    expect(screen.queryByText('Jogos na biblioteca')).not.toBeInTheDocument();
  });

  it.each(['private-or-unavailable', 'timeout', 'rate-limited', 'unavailable'] as const)('exibe %s sem afirmar zero jogos', async code => {
    render(<App libraryProvider={provider(failure(code))} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(failure(code).error.message);
    expect(screen.queryByText('Jogos na biblioteca')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum jogo corresponde aos filtros.')).not.toBeInTheDocument();
  });

  it('mantém biblioteca explicitamente vazia como resultado válido', async () => {
    render(<App libraryProvider={provider({ ok: true, data: { games: [], incomplete: false } })} />);
    expect(await screen.findByText('Nenhum jogo corresponde aos filtros.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('exibe dados parciais e progresso pendente sem 0% ou exportação enganosa', async () => {
    const user = userEvent.setup();
    render(<App libraryProvider={provider({ ok: true, data: { games: [pendingGame], incomplete: true } })} />);
    const card = await screen.findByRole('button', { name: /^Jogo via provedor de teste/ });
    expect(screen.getByRole('status')).toHaveTextContent('Biblioteca incompleta');
    expect(card).toHaveTextContent('Tempo indisponível');
    expect(card).toHaveTextContent('Progresso indisponível');
    expect(card).not.toHaveTextContent('0%');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar jogos' }), 'pending');
    expect(screen.queryByRole('button', { name: /^Jogo via provedor de teste/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar jogos' }), 'all');
    await user.click(screen.getByRole('button', { name: /^Jogo via provedor de teste/ }));
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeDisabled();
  });

  it('ignora respostas atrasadas de um provedor substituído e cancela consultas desmontadas', async () => {
    let resolveOld!: (result: LibraryResult) => void;
    let signal: AbortSignal | undefined;
    const oldProvider: LibraryProvider = { source: 'steam', getGames: vi.fn<LibraryProvider['getGames']>(requestSignal => {
      signal = requestSignal;
      return new Promise<LibraryResult>(resolve => { resolveOld = resolve; });
    }) };
    const view = render(<App libraryProvider={oldProvider} />);
    await waitFor(() => expect(oldProvider.getGames).toHaveBeenCalledOnce());
    view.rerender(<App libraryProvider={provider({ ok: true, data: { games: [pendingGame], incomplete: false } })} />);
    expect(signal?.aborted).toBe(true);
    await screen.findByRole('button', { name: /^Jogo via provedor de teste/ });
    resolveOld(failure('unavailable'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('não propaga exceções brutas do provedor para a interface', async () => {
    render(<App libraryProvider={{ source: 'steam', getGames: () => { throw new Error('sensitive provider value'); } }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Steam indisponível');
    expect(screen.queryByText(/sensitive/)).not.toBeInTheDocument();
  });

  it('distingue jogo sem conquistas, jogo pendente e 0% conhecido', () => {
    expect(achievementPercent(pendingGame)).toBeNull();
    expect(progressLabel({ ...pendingGame, achievementsStatus: 'none' })).toBe('Sem conquistas');
    expect(achievementPercent({ ...pendingGame, achievementsStatus: 'ready', achievements: [{
      id: 'FIRST', name: 'A', description: '', achieved: false, estimatedDifficulty: 'desconhecida', guideStatus: 'indisponível',
    }] })).toBe(0);
  });

  it('impede carregar o transporte de servidor no ambiente do navegador', async () => {
    await expect(import('../backend/steam/SteamWebApi.server')).rejects.toThrow('só pode ser usado no servidor');
  });

  it('não apresenta conquista de estado desconhecido como pendente', async () => {
    const user = userEvent.setup();
    const game: Game = { ...pendingGame, achievementsStatus: 'incomplete', achievements: [{
      id: 'FIRST', name: 'Conquista de teste', description: '', achieved: null,
      estimatedDifficulty: 'desconhecida', guideStatus: 'indisponível',
    }] };
    render(<App libraryProvider={provider({ ok: true, data: { games: [game], incomplete: false } })} />);
    await user.click(await screen.findByRole('button', { name: /^Jogo via provedor de teste/ }));
    expect(screen.getByText('Indisponível', { exact: true })).toBeVisible();
    expect(screen.queryByText('Pendente', { exact: true })).not.toBeInTheDocument();
  });

  it('não arredonda progresso parcial para 100% concluído', () => {
    const achievements = Array.from({ length: 200 }, (_, index) => ({
      id: String(index), name: 'A', description: '', achieved: index < 199,
      estimatedDifficulty: 'desconhecida' as const, guideStatus: 'indisponível' as const,
    }));
    expect(achievementPercent({ ...pendingGame, achievementsStatus: 'ready', achievements })).toBe(99);
  });
});
