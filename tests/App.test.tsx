import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { exportGameCard } from '../src/exportImage';

vi.mock('../src/exportImage', () => ({ exportGameCard: vi.fn() }));

async function renderDemo() {
  render(<App />);
  await screen.findByRole('textbox', { name: 'Buscar jogo' });
}

const gameCards = () => screen.queryAllByRole('button', { name: /% completo$/ });

describe('biblioteca demonstrativa', () => {
  it('mostra os quatro jogos, inicialmente ordenados por tempo jogado', async () => {
    await renderDemo();
    expect(gameCards()).toHaveLength(4);
    expect(gameCards()[0]).toHaveAccessibleName(/^Forestbound/);
    expect(gameCards()[3]).toHaveAccessibleName(/^Steel Horizon/);
  });

  it('busca por parte do nome sem distinguir maiúsculas de minúsculas', async () => {
    const user = userEvent.setup();
    await renderDemo();
    await user.type(screen.getByRole('textbox', { name: 'Buscar jogo' }), 'NEbULa');
    expect(gameCards()).toHaveLength(1);
    expect(gameCards()[0]).toHaveAccessibleName(/^Nebula Drift/);
  });

  it('mostra o estado vazio e restaura os jogos ao limpar a busca', async () => {
    const user = userEvent.setup();
    await renderDemo();
    const search = screen.getByRole('textbox', { name: 'Buscar jogo' });
    await user.type(search, 'jogo inexistente');
    expect(gameCards()).toHaveLength(0);
    expect(screen.getByText('Nenhum jogo corresponde aos filtros.')).toBeVisible();
    await user.clear(search);
    expect(gameCards()).toHaveLength(4);
  });

  it('filtra os completos e os incompletos sem perder a lista original', async () => {
    const user = userEvent.setup();
    await renderDemo();
    const filter = screen.getByRole('combobox', { name: 'Filtrar jogos' });
    await user.selectOptions(filter, 'done');
    expect(gameCards()).toHaveLength(1);
    expect(gameCards()[0]).toHaveAccessibleName(/^Forestbound/);
    await user.selectOptions(filter, 'pending');
    expect(gameCards()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Forestbound/ })).not.toBeInTheDocument();
    await user.selectOptions(filter, 'all');
    expect(gameCards()).toHaveLength(4);
  });

  it.each([
    ['name', ['Chrono Vale', 'Forestbound', 'Nebula Drift', 'Steel Horizon']],
    ['progress', ['Forestbound', 'Nebula Drift', 'Chrono Vale', 'Steel Horizon']],
  ])('ordena pelo critério %s', async (sort, titles) => {
    const user = userEvent.setup();
    await renderDemo();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ordenar jogos' }), sort);
    titles.forEach((title, index) => expect(gameCards()[index]).toHaveTextContent(title));
  });

  it('combina busca e filtro de conclusão', async () => {
    const user = userEvent.setup();
    await renderDemo();
    await user.type(screen.getByRole('textbox', { name: 'Buscar jogo' }), 'Nebula');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar jogos' }), 'done');
    expect(gameCards()).toHaveLength(0);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar jogos' }), 'pending');
    expect(gameCards()).toHaveLength(1);
    expect(gameCards()[0]).toHaveAccessibleName(/^Nebula Drift/);
  });

  it('abre conquistas, exporta o formato escolhido e retorna à biblioteca', async () => {
    const user = userEvent.setup();
    await renderDemo();
    await user.click(screen.getByRole('button', { name: /^Nebula Drift/ }));
    expect(screen.getByRole('heading', { name: 'Nebula Drift' })).toBeVisible();
    expect(screen.getByText('2 de 4')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(exportGameCard).toHaveBeenLastCalledWith(expect.objectContaining({ appid: 101 }), 'png');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Formato da exportação' }), 'jpeg');
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(exportGameCard).toHaveBeenLastCalledWith(expect.objectContaining({ appid: 101 }), 'jpeg');
    await user.click(screen.getByRole('button', { name: 'Voltar para a biblioteca' }));
    expect(gameCards()).toHaveLength(4);
  });
});

describe('desejos e perfil demonstrativos', () => {
  it('adiciona um título entre lojas e permite removê-lo da lista de desejos', async () => {
    const user = userEvent.setup();
    await renderDemo();
    await user.click(screen.getByRole('button', { name: 'Promoções' }));
    await user.click(screen.getAllByRole('button', { name: 'Adicionar Chrono Vale à lista de desejos' })[0]);
    expect(screen.getAllByRole('button', { name: 'Remover Chrono Vale da lista de desejos' })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /^Lista de desejos/ }));
    expect(within(screen.getByRole('main')).getByText('Chrono Vale')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remover Chrono Vale da lista de desejos' }));
    expect(screen.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
  });

  it('mantém o login desabilitado e não oferece campos de credenciais', async () => {
    const user = userEvent.setup();
    await renderDemo();
    await user.click(screen.getByRole('button', { name: 'Meu perfil' }));
    expect(screen.getByText('Entrar com Steam — em desenvolvimento')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nenhuma conta conectada' })).toBeVisible();
  });
});
