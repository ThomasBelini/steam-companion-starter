import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { demoGames } from '../src/demo';
import type { LibraryProvider } from '../src/types';

async function demo() {
  const result = render(<App />);
  await screen.findByRole('textbox', { name: 'Buscar jogo' });
  return result;
}
const shelf = () => within(screen.getByRole('region', { name: 'Favoritos' }));
const cards = () => within(screen.getByRole('region', { name: 'Todos os jogos' })).getAllByRole('button', { name: /% completo$/ });

describe('biblioteca visual — organização e acessibilidade', () => {
  it('mantém favoritos independentes dos desejos e preserva a coleção completa', async () => {
    const user = userEvent.setup();
    await demo();
    expect(shelf().getAllByRole('button', { name: /^Abrir favorito:/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Adicionar Steel Horizon aos favoritos' }));
    expect(shelf().getAllByRole('button', { name: /^Abrir favorito:/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Desfavoritar Steel Horizon' })).toHaveAttribute('aria-pressed', 'true');
    expect(cards()).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Lista de desejos' }));
    expect(screen.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Minha biblioteca' }));
    expect(shelf().getByRole('button', { name: 'Abrir favorito: Steel Horizon' })).toBeVisible();
  });

  it('permite esvaziar e recompor favoritos sem excluir jogos', async () => {
    const user = userEvent.setup();
    await demo();
    await user.click(shelf().getByRole('button', { name: 'Remover Nebula Drift dos favoritos' }));
    await user.click(shelf().getByRole('button', { name: 'Remover Forestbound dos favoritos' }));
    expect(shelf().getByText('Seus jogos favoritos, sempre por perto.')).toBeVisible();
    expect(cards()).toHaveLength(4);
    const add = screen.getByRole('button', { name: 'Adicionar Nebula Drift aos favoritos' });
    add.focus();
    await user.keyboard(' ');
    expect(shelf().getByRole('button', { name: 'Abrir favorito: Nebula Drift' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desfavoritar Nebula Drift' })).toHaveFocus();
  });

  it('mantém a escolha de favoritos durante busca e permite limpar o estado vazio', async () => {
    const user = userEvent.setup();
    await demo();
    await user.type(screen.getByRole('textbox', { name: 'Buscar jogo' }), 'inexistente');
    expect(screen.queryByRole('region', { name: 'Favoritos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Jogos recentes' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }));
    expect(cards()).toHaveLength(4);
    expect(shelf().getAllByRole('button', { name: /^Abrir favorito:/ })).toHaveLength(2);
  });

  it('troca o destaque ilustrativo sem mudar ordenação e abre o jogo selecionado', async () => {
    const user = userEvent.setup();
    await demo();
    await user.click(screen.getByRole('button', { name: 'Destacar Chrono Vale' }));
    expect(screen.getByRole('button', { name: 'Destacar Chrono Vale' })).toHaveAttribute('aria-pressed', 'true');
    expect(cards()[0]).toHaveAccessibleName(/^Forestbound/);
    await user.click(screen.getByRole('button', { name: 'Ver conquistas' }));
    expect(screen.getByRole('heading', { name: 'Chrono Vale' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Voltar para a biblioteca' }));
    expect(screen.getByRole('heading', { name: 'Minha biblioteca' })).toHaveFocus();
  });

  it('oferece atalho de conteúdo, navegação identificada e progresso acessível', async () => {
    await demo();
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('button', { name: 'Minha biblioteca' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('progressbar', { name: 'Conquistas de Nebula Drift' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('não aplica favoritos, arte ou histórico fictícios a outro provedor', async () => {
    const user = userEvent.setup();
    const rendered = await demo();
    const provider: LibraryProvider = { source: 'steam', getGames: async () => ({ ok: true, data: {
      games: [{ ...demoGames[0], title: 'Jogo do provedor', source: 'steam' }], incomplete: false,
    } }) };
    rendered.rerender(<App libraryProvider={provider} />);
    await screen.findByRole('button', { name: /^Jogo do provedor/ });
    expect(screen.queryByRole('region', { name: 'Jogos recentes' })).not.toBeInTheDocument();
    expect(shelf().queryByRole('button', { name: /^Abrir favorito:/ })).not.toBeInTheDocument();
    expect(screen.queryByText('COMPANION ORIGINAL')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adicionar Jogo do provedor aos favoritos' }));
    expect(shelf().getByRole('button', { name: 'Abrir favorito: Jogo do provedor' })).toBeVisible();
  });

  it('reinicia favoritos demonstrativos ao remontar, sem persistência implícita', async () => {
    const user = userEvent.setup();
    const rendered = await demo();
    await user.click(screen.getByRole('button', { name: 'Adicionar Steel Horizon aos favoritos' }));
    rendered.unmount();
    await demo();
    expect(screen.getByRole('button', { name: 'Adicionar Steel Horizon aos favoritos' })).toHaveAttribute('aria-pressed', 'false');
  });
});
