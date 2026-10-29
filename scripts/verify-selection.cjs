const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

// Only the web client is needed; no API, worker, database or vision service.
const baseUrl = process.env.AURASPACE_WEB_URL || 'http://127.0.0.1:3000';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        hasTouch: touch,
        isMobile: touch,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Open Sunday living', exact: true }).click();
      await page.waitForSelector('canvas');
      await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
      await page.waitForTimeout(700);

      const box = await page.locator('canvas').boundingBox();
      const vertical = Math.max(5, 6 / (box.width / box.height));
      const position = (x, z) => ({
        x: box.x + box.width / 2 + (x - 2.6) * box.height / vertical,
        y: box.y + box.height / 2 + (z - 2.1) * box.height / vertical,
      });
      const tap = async (x, z) => {
        const p = position(x, z);
        if (touch) await page.touchscreen.tap(p.x, p.y);
        else await page.mouse.click(p.x, p.y);
      };
      const state = () => page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('auraspace-studio'));
        return saved.projects.find((project) => project.id === 'sample-living');
      });
      const initial = await state();
      const deselect = page.getByRole('button', { name: 'Deselect furniture' });
      const details = page.getByRole('button', { name: 'Details', exact: true });

      await tap(2.5, 0.75);
      await details.waitFor({ state: 'visible', timeout: 3000 });
      await page.waitForTimeout(150);
      assert.equal(await deselect.isVisible(), true, 'a tap must retain selection after release');
      assert.equal(await page.getByRole('button', { name: 'Close item details' }).count(), 0);
      assert.equal(await page.getByRole('region', { name: 'Furniture library' }).count(), 0);
      assert.deepEqual((await state()).items, initial.items, 'a tap must not move or modify items');

      await tap(2.5, 0.75);
      assert.equal(await deselect.isVisible(), true, 'tapping an already selected piece retains selection');

      await page.getByRole('button', { name: 'Lock furniture', exact: true }).click();
      await tap(0.8, 2.5);
      await deselect.waitFor({ state: 'hidden' });
      await tap(2.5, 0.75);
      await page.getByRole('button', { name: 'Unlock furniture', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Unlock furniture', exact: true }).click();

      await tap(4.35, 2.15);
      await details.click();
      await page.getByRole('button', { name: 'Close item details' }).waitFor();
      await page.getByRole('heading', { name: 'Lounge chair', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Close item details' }).click();
      await tap(0.8, 2.5);
      await deselect.waitFor({ state: 'hidden' });

      if (!touch) {
        const from = position(2.5, 0.75);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + 45, from.y + 30, { steps: 8 });
        await page.mouse.up();
        await details.waitFor();
        const moved = (await state()).items.find((item) => item.type === 'sofa');
        assert.notEqual(moved.x, 2.5, 'dragging still commits the move');
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        assert.equal((await state()).items.find((item) => item.type === 'sofa').x, 2.5);
      }

      assert.deepEqual(errors, [], 'the editor must not emit browser errors');
      console.log(`PASS ${touch ? 'touch' : 'mouse'}: tap/re-tap, locked selection, switching items, floor deselection${touch ? '' : ', drag and undo'}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
