import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { demoDeals } from '../src/demo';
import { DealsPage } from '../src/commerce/DealsPage';
import { WishlistPage } from '../src/commerce/WishlistPage';
import { OfferComparison } from '../src/commerce/OfferComparison';
import { groupDemoOffers, lowestDemoOffer } from '../src/commerce/demoOffers';

async function openDeals() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('textbox', { name: 'Buscar jogo' });
  await user.click(screen.getByRole('button', { name: 'Promoções' }));
  return user;
}

describe('promoções e desejos demonstrativos', () => {
  it('agrupa as cinco ofertas por título sem modificar dados, valores ou ordem', () => {
    const original = structuredClone(demoDeals);
    expect(groupDemoOffers(demoDeals).map(group => [group.title, group.offers.length])).toEqual([['Chrono Vale', 3], ['Nebula Drift', 2]]);
    expect(lowestDemoOffer(demoDeals.filter(deal => deal.title === 'Chrono Vale'))?.priceBRL).toBe(30.9);
    expect(demoDeals).toEqual(original);
  });

  it.each([{ offers: [] }, { offers: [{ ...demoDeals[0], priceBRL: NaN }] }, { offers: [{ ...demoDeals[0], priceBRL: -1 }] }, { offers: [{ ...demoDeals[0], priceBRL: Infinity }] }])('não converte ausência/preço inválido em zero: %j', ({ offers }) => {
    expect(lowestDemoOffer(offers)).toBeUndefined();
  });

  it('preserva preço zero explicitamente conhecido e não altera a lista ao comparar', () => {
    const offers = Object.freeze([{ ...demoDeals[0], priceBRL: 0 }, demoDeals[1]]);
    expect(lowestDemoOffer(offers)?.priceBRL).toBe(0);
  });

  it('exibe lojas, capas originais, reais e os avisos de simulação sem links de compra', async () => {
    await openDeals();
    const comparison = screen.getByRole('article', { name: 'Comparar ofertas de Chrono Vale' });
    expect(within(comparison).getAllByRole('listitem')).toHaveLength(3);
    expect(within(comparison).getByText('Steam')).toBeVisible();
    expect(within(comparison).getByText('Nuuvem')).toBeVisible();
    expect(within(comparison).getByText('Eneba')).toBeVisible();
    expect(within(comparison).getByText('R$ 39,90', { exact: true })).toBeVisible();
    expect(within(comparison).getByText('Mínimo ilustrativo: R$ 29,90')).toBeVisible();
    expect(within(comparison).getByText('Histórico indisponível')).toBeVisible();
    expect(within(comparison).getByText('Ativação BR não verificada')).toBeVisible();
    expect(within(comparison).getByText('Taxas adicionais não verificadas')).toBeVisible();
    expect(document.querySelectorAll('.offer-game-cover img')).toHaveLength(2);
    expect(within(screen.getByRole('main')).queryByRole('link', { name: /comprar|loja|oferta/i })).not.toBeInTheDocument();
    expect(screen.getByText('Preços inteiramente fictícios nesta demonstração.')).toBeVisible();
  });

  it('combina busca por título, loja e desejos, sem alterar o catálogo', async () => {
    const user = await openDeals();
    await user.click(screen.getAllByRole('button', { name: 'Adicionar Chrono Vale à lista de desejos' })[0]);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar em promoções' }), 'cHrOnO');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por loja' }), 'Eneba');
    await user.click(screen.getByRole('checkbox', { name: 'Apenas desejos' }));
    expect(screen.getAllByRole('article', { name: /^Comparar ofertas de/ })).toHaveLength(1);
    expect(screen.getAllByRole('listitem', { name: /^Oferta/ })).toHaveLength(1);
    expect(screen.getByText('1 de 3 ofertas demo')).toBeVisible();
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar em promoções' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por loja' }), 'all');
    await user.click(screen.getByRole('checkbox', { name: 'Apenas desejos' }));
    expect(screen.getAllByRole('listitem', { name: /^Oferta/ })).toHaveLength(5);
  });

  it('permite limpar um filtro de desejos vazio sem perder ofertas', async () => {
    const user = await openDeals();
    await user.click(screen.getByRole('checkbox', { name: 'Apenas desejos' }));
    expect(screen.getByRole('heading', { name: 'Nenhuma oferta corresponde aos filtros.' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }));
    expect(screen.getAllByRole('listitem', { name: /^Oferta/ })).toHaveLength(5);
    expect(screen.getByRole('checkbox', { name: 'Apenas desejos' })).not.toBeChecked();
  });

  it('distingue catálogo sem dados, sem inventar ofertas ou botão sem ação', () => {
    render(<DealsPage deals={[]} wishlist={[]} search="" onSearch={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Nenhuma oferta demonstrativa disponível.' })).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mantém metadados inválidos/ausentes como indisponíveis, sem desconto ou histórico inventado', () => {
    render(<OfferComparison title="Jogo fictício sem arte" offers={[{ ...demoDeals[0], title: 'Jogo fictício sem arte', priceBRL: NaN, discountPercent: -5, historicLowBRL: null, regionVerified: true, finalPriceVerified: true }]}
      total={1} saved={false} onToggle={vi.fn()} />);
    expect(screen.getByText('Preço indisponível')).toBeVisible();
    expect(screen.getByText('Desconto indisponível')).toBeVisible();
    expect(screen.getByText('Histórico indisponível')).toBeVisible();
    expect(screen.getByText('Ativação BR não verificada')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
  });

  it('mantém desejo único entre lojas e volta para comparar apenas esse jogo', async () => {
    const user = await openDeals();
    await user.click(screen.getAllByRole('button', { name: 'Adicionar Chrono Vale à lista de desejos' })[0]);
    expect(screen.getAllByRole('button', { name: 'Remover Chrono Vale da lista de desejos' })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /^Lista de desejos/ }));
    expect(screen.getAllByRole('article', { name: /^Desejo:/ })).toHaveLength(1);
    expect(screen.getByText('3 ofertas demonstrativas')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Comparar ofertas' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar em promoções' })).toHaveValue('Chrono Vale');
    expect(screen.getAllByRole('listitem', { name: /^Oferta/ })).toHaveLength(3);
  });

  it('não remove desejos ao filtrar uma lista vazia e restaura o foco ao remover', async () => {
    const user = await openDeals();
    await user.click(screen.getAllByRole('button', { name: 'Adicionar Nebula Drift à lista de desejos' })[0]);
    await user.click(screen.getByRole('button', { name: /^Lista de desejos/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar na lista de desejos' }), 'nada');
    expect(screen.getByRole('heading', { name: 'Nenhum desejo corresponde aos filtros.' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }));
    expect(screen.getAllByRole('article', { name: /^Desejo:/ })).toHaveLength(1);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar disponibilidade demonstrativa' }), 'unavailable');
    await user.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }));
    await user.click(screen.getByRole('button', { name: 'Remover Nebula Drift da lista de desejos' }));
    expect(screen.getByRole('heading', { name: 'Lista de desejos' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
  });

  it('mostra desejo sem oferta/arte sem preço zero, disponibilidade ou alertas falsos', async () => {
    const user = userEvent.setup();
    render(<WishlistPage deals={demoDeals} wishlist={['Jogo fictício sem oferta']} onBrowse={vi.fn()} onCompare={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Preço indisponível')).toBeVisible();
    expect(screen.getByText('Sem ofertas demonstrativas disponíveis')).toBeVisible();
    expect(screen.getByText('Disponibilidade real não verificada')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Comparar ofertas' })).not.toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Espaço reservado · Ainda não disponíveis')).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar disponibilidade demonstrativa' }), 'unavailable');
    expect(screen.getByRole('article', { name: 'Desejo: Jogo fictício sem oferta' })).toBeVisible();
  });

  it('reinicia os desejos ao remontar o protótipo', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Promoções' }));
    await user.click(screen.getAllByRole('button', { name: 'Adicionar Chrono Vale à lista de desejos' })[0]);
    view.unmount();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Lista de desejos/ }));
    expect(screen.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
  });

  it('mantém busca/filtro da biblioteca separados da busca por ofertas', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'Buscar jogo' }), 'Nebula');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar jogos' }), 'pending');
    await user.click(screen.getByRole('button', { name: 'Promoções' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar em promoções' }), 'Chrono');
    await user.click(screen.getByRole('button', { name: 'Minha biblioteca' }));
    expect(screen.getByRole('textbox', { name: 'Buscar jogo' })).toHaveValue('Nebula');
    expect(screen.getByRole('combobox', { name: 'Filtrar jogos' })).toHaveValue('pending');
    expect(screen.getByRole('button', { name: /^Nebula Drift \d/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Chrono Vale \d/ })).not.toBeInTheDocument();
  });
});
