import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 667 },
  { width: 570, height: 780 },
  { width: 640, height: 640 },
  { width: 960, height: 640 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    for (const activation of ['mouse', 'Enter', 'Space'] as const) {
      test(`limpa busca e filtro com ${activation}`, async ({ page }) => {
        await page.goto('/');
        const search = page.getByRole('textbox', { name: 'Buscar jogo' });
        const filter = page.getByRole('combobox', { name: 'Filtrar jogos' });
        await expect(page.locator('.library-card')).toHaveCount(4);
        await search.fill('inexistente');
        await filter.selectOption('done');
        await expect(page.locator('.library-card')).toHaveCount(0);
        const clear = page.getByRole('button', { name: 'Limpar busca e filtros' });
        await expect(clear).toBeVisible();

        if (activation === 'mouse') {
          const overlapsSummary = await clear.evaluate(button => {
            const bounds = button.getBoundingClientRect();
            return [...document.querySelectorAll('.library-summary dd')].some(item => {
              const summary = item.getBoundingClientRect();
              return bounds.left < summary.right && bounds.right > summary.left
                && bounds.top < summary.bottom && bounds.bottom > summary.top;
            });
          });
          expect(overlapsSummary).toBe(false);
          const observedClick = clear.evaluate(element => new Promise(resolve => {
            element.addEventListener('click', event => resolve({
              trusted: event.isTrusted, detail: event instanceof MouseEvent ? event.detail : null,
            }), { once: true });
          }));
          // A browser pointer click with the normal hit-target/actionability checks.
          await clear.click();
          await expect(observedClick).resolves.toEqual({ trusted: true, detail: 1 });
        } else {
          // Tab from the last filter control to the actual reset button.
          await page.getByRole('combobox', { name: 'Ordenar jogos' }).focus();
          await page.keyboard.press('Tab');
          await expect(clear).toBeFocused();
          await page.keyboard.press(activation);
        }

        await expect(search).toHaveValue('');
        await expect(filter).toHaveValue('all');
        await expect(clear).toHaveCount(0);
        await expect(page.locator('.library-card')).toHaveCount(4);
        await expect(page.getByRole('region', { name: 'Jogos recentes' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Favoritos', exact: true })).toBeVisible();
      });
    }
  });
}
