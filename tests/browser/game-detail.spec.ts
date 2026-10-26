import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const width of [320, 375, 640, 960, 1280, 1440, 1920]) {
  test(`página individual em ${width}px: navegação, conquistas e layout`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Buscar jogo' }).fill('Nebula');
    await page.getByRole('combobox', { name: 'Filtrar jogos' }).selectOption('pending');
    await page.getByRole('button', { name: /^Nebula Drift \d/ }).click();
    await expect(page.getByRole('heading', { name: 'Nebula Drift', exact: true })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Pendentes', exact: true }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Obtidas', exact: true }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await page.locator('.detail-hero img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`game-detail-${width}.png`), fullPage: true });

    const navigation = page.getByRole('navigation', { name: 'Seções do jogo' });
    await navigation.getByRole('link', { name: 'Conquistas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Conquistas', exact: true })).toBeFocused();
    await navigation.getByRole('link', { name: 'Guias', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Guias e recomendações' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Guias e recomendações' }).getByRole('link')).toHaveCount(0);
    await navigation.getByRole('link', { name: 'Informações gerais' }).click();
    await expect(page.getByRole('region', { name: 'Informações gerais' })).toBeFocused();

    await page.getByRole('button', { name: 'Voltar para a biblioteca' }).click();
    await expect(page.getByRole('heading', { name: 'Minha biblioteca', exact: true })).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Buscar jogo' })).toHaveValue('Nebula');
    await expect(page.getByRole('combobox', { name: 'Filtrar jogos' })).toHaveValue('pending');
    await expect(page.locator('.library-card')).toHaveCount(1);
  });
}

test('todos os jogos, 100%, zero conhecido e redimensionamento', async ({ page }) => {
  await page.goto('/');
  for (const [name, progress] of [['Forestbound', 100], ['Chrono Vale', 25], ['Steel Horizon', 0]] as const) {
    await page.getByRole('button', { name: new RegExp(`^${name} \\d`) }).click();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(progress));
    if (progress === 100) await expect(page.getByText('100% concluído', { exact: true })).toBeVisible();
    else await expect(page.getByText('100% concluído', { exact: true })).toHaveCount(0);
    for (const width of [960, 1440, 375]) {
      await page.setViewportSize({ width, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Voltar para a biblioteca' }).click();
  }
});

test('exporta arquivos PNG e JPEG reais com 1200 × 630', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Nebula Drift \d/ }).click();
  for (const format of ['png', 'jpeg'] as const) {
    await page.getByRole('combobox', { name: 'Formato da exportação' }).selectOption(format);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const download = await downloaded;
    const extension = format === 'png' ? 'png' : 'jpg';
    expect(download.suggestedFilename()).toBe(`progresso-nebula-drift.${extension}`);
    const output = info.outputPath(download.suggestedFilename());
    await download.saveAs(output);
    const bytes = await readFile(output);
    expect(bytes.length).toBeGreaterThan(1000);
    if (format === 'png') {
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
    } else {
      expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
      let dimensions: number[] = [];
      for (let offset = 2; offset + 8 < bytes.length;) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const marker = bytes[offset + 1];
        if ([192, 193, 194].includes(marker)) { dimensions = [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)]; break; }
        offset += [216, 217].includes(marker) ? 2 : 2 + bytes.readUInt16BE(offset + 2);
      }
      expect(dimensions).toEqual([1200, 630]);
    }
  }
});
