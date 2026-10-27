import { expect, test } from '@playwright/test';

for (const width of [375, 960, 1280]) {
  test(`perfil web em ${width}px: sem IPC ou login, com navegação por teclado`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Meu perfil', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Iniciar demonstração' })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Demonstração nativa indisponível');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Minha biblioteca', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Minha biblioteca' })).toBeVisible();
  });
}

test('estados simulados de IPC: Enter inicia e Espaço cancela sem expor segredos', async ({ page }) => {
  // UI contract only: does not execute Rust or prove native security.
  await page.addInitScript(() => {
    let state = 'idle';
    Object.assign(window, { isTauri: true, __SC_PAIRING_DEMO__: true,
      __TAURI_INTERNALS__: { invoke: async (command: string, args: Record<string, unknown>) => {
        if (Object.keys(args).length) throw new Error('Unexpected IPC arguments');
        if (command === 'pairing_demo_start') state = 'waiting';
        if (command === 'pairing_demo_cancel') state = 'cancelled';
        return state;
      } },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Meu perfil', exact: true }).click();
  await page.keyboard.press('Tab');
  const start = page.getByRole('button', { name: 'Iniciar demonstração' });
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Aguardando confirmação');
  const cancel = page.getByRole('button', { name: 'Cancelar demonstração' });
  await cancel.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toContainText('cancelada');
  await expect(page.locator('body')).not.toContainText('code=');
});
