import { expect, test, type Page } from '@playwright/test';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const width of [320, 375, 640, 960, 1280, 1440, 1920]) {
  test(`promoções e desejos em ${width}px: filtros, comparação e remoção`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const external: string[] = [];
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('data:')) external.push(request.url()); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Promoções', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Promoções', exact: true })).toBeFocused();
    await expect(page.getByRole('listitem', { name: /^Oferta/ })).toHaveCount(5);
    await expect(page.getByText('Preços inteiramente fictícios nesta demonstração.')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar em promoções' }).fill('nEbUlA');
    await page.getByRole('combobox', { name: 'Filtrar por loja' }).selectOption('Nuuvem');
    await expect(page.getByRole('listitem', { name: /^Oferta/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Adicionar Nebula Drift à lista de desejos' }).click();
    await page.getByRole('checkbox', { name: 'Apenas desejos' }).check();
    await page.getByRole('searchbox', { name: 'Buscar em promoções' }).fill('inexistente');
    await expect(page.getByRole('heading', { name: 'Nenhuma oferta corresponde aos filtros.' })).toBeVisible();
    await page.getByRole('button', { name: 'Limpar busca e filtros' }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar em promoções' })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Filtrar por loja' })).toHaveValue('all');
    await expect(page.getByRole('checkbox', { name: 'Apenas desejos' })).not.toBeChecked();
    await expect(page.getByRole('listitem', { name: /^Oferta/ })).toHaveCount(5);
    await page.getByRole('button', { name: 'Adicionar Chrono Vale à lista de desejos' }).first().click();
    await expect(page.getByRole('button', { name: 'Remover Chrono Vale da lista de desejos' })).toHaveCount(3);
    await page.locator('.offer-game-cover img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    await noOverflow(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`promotions-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: /^Lista de desejos/ }).click();
    await expect(page.getByRole('heading', { name: 'Lista de desejos', exact: true })).toBeFocused();
    await expect(page.getByRole('article', { name: /^Desejo:/ })).toHaveCount(2);
    await expect(page.getByText('Espaço reservado · Ainda não disponíveis')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar na lista de desejos' }).fill('Nebula');
    await expect(page.getByRole('article', { name: /^Desejo:/ })).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Filtrar disponibilidade demonstrativa' }).selectOption('unavailable');
    await expect(page.getByRole('heading', { name: 'Nenhum desejo corresponde aos filtros.' })).toBeVisible();
    await page.getByRole('button', { name: 'Limpar busca e filtros' }).click();
    await expect(page.getByRole('article', { name: /^Desejo:/ })).toHaveCount(2);
    await noOverflow(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`wishlist-${width}.png`), fullPage: true });
    await page.getByRole('article', { name: 'Desejo: Chrono Vale' }).getByRole('button', { name: 'Comparar ofertas' }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar em promoções' })).toHaveValue('Chrono Vale');
    await expect(page.getByRole('listitem', { name: /^Oferta/ })).toHaveCount(3);
    await page.getByRole('button', { name: /^Lista de desejos/ }).click();
    await page.getByRole('button', { name: 'Remover Chrono Vale da lista de desejos' }).click();
    await expect(page.getByRole('heading', { name: 'Lista de desejos', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Remover Nebula Drift da lista de desejos' }).click();
    await expect(page.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lista de desejos', exact: true })).toBeFocused();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`wishlist-empty-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Ver promoções' }).click();
    await expect(page.getByRole('listitem', { name: /^Oferta/ })).toHaveCount(5);
    expect(external).toEqual([]);
  });
}

test('desejos por teclado e foco após remover o último jogo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Lista de desejos/ }).click();
  await page.getByRole('button', { name: 'Ver promoções' }).focus();
  await page.keyboard.press('Enter');
  const heart = page.getByRole('button', { name: 'Adicionar Chrono Vale à lista de desejos' }).first();
  await heart.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Remover Chrono Vale da lista de desejos' })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Remover Chrono Vale da lista de desejos' }).first()).toBeFocused();
  await page.getByRole('button', { name: /^Lista de desejos/ }).click();
  await page.getByRole('button', { name: 'Remover Chrono Vale da lista de desejos' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Lista de desejos', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
});

test('recarregar reinicia desejos e não mistura buscas de biblioteca e promoções', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Buscar jogo' }).fill('Nebula');
  await page.getByRole('combobox', { name: 'Filtrar jogos' }).selectOption('pending');
  await page.getByRole('button', { name: 'Promoções', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar em promoções' }).fill('Chrono');
  await page.getByRole('button', { name: 'Adicionar Chrono Vale à lista de desejos' }).first().click();
  await page.getByRole('button', { name: 'Minha biblioteca', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar jogo' })).toHaveValue('Nebula');
  await expect(page.getByRole('combobox', { name: 'Filtrar jogos' })).toHaveValue('pending');
  await page.reload();
  await page.getByRole('button', { name: /^Lista de desejos/ }).click();
  await expect(page.getByRole('heading', { name: 'Sua lista está vazia' })).toBeVisible();
});
