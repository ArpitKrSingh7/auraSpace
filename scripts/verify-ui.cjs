const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: [
      '--no-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const go = async (path) =>
      page.goto('http://127.0.0.1:3000' + path, { waitUntil: 'networkidle' });
    await go('/');
    await page
      .getByRole('heading', { name: 'Good things start with a room.' })
      .waitFor();
    await page.screenshot({ path: '/tmp/auraspace-home.png', fullPage: true });
    await page.getByRole('textbox', { name: 'Search rooms' }).fill('Sunday');
    assert.equal(await page.locator('article').count(), 1);
    await page
      .getByRole('textbox', { name: 'Search rooms' })
      .fill('nothing matches');
    assert.equal(await page.locator('article').count(), 0);
    await page
      .getByRole('button', { name: 'View all rooms', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Open Sunday living', exact: true })
      .click();
    await page.waitForSelector('canvas');
    await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
    await page.waitForTimeout(400);
    const box = await page.locator('canvas').boundingBox();
    const vertical = Math.max(4.2 + 0.8, (5.2 + 0.8) / (box.width / box.height));
    const pos = (x, z) => ({
      x: box.x + box.width / 2 + ((x - 2.6) * box.height) / vertical,
      y: box.y + box.height / 2 + ((z - 2.1) * box.height) / vertical,
    });
    const before = pos(2.5, 0.75);
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + 55, before.y + 45, { steps: 10 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Details', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('region', { name: 'Furniture library' }).count(),
      0,
      'tray stays closed on drag',
    );
    assert.equal(
      await page.getByRole('button', { name: 'Close item details' }).count(),
      0,
      'details stay closed on drag',
    );
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('auraspace-studio')),
    );
    let sofa = saved.projects
      .find((p) => p.id === 'sample-living')
      .items.find((i) => i.type === 'sofa');
    assert.notEqual(sofa.x, 2.5);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    const afterUndo = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('auraspace-studio'))
          .projects.find((p) => p.id === 'sample-living')
          .items.find((i) => i.type === 'sofa').x,
    );
    assert.equal(afterUndo, 2.5);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await page.getByRole('button', { name: 'Close item details' }).waitFor();
    await page.getByRole('button', { name: 'Close item details' }).click();
    await page.getByRole('button', { name: 'Deselect furniture' }).click();
    await page
      .getByRole('button', { name: 'Add furniture', exact: true })
      .click();
    await page.getByRole('region', { name: 'Furniture library' }).waitFor();
    await page.getByRole('button', { name: /Linen/ }).click();
    assert.equal(
      await page.getByRole('region', { name: 'Furniture library' }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Cancel placement' }).click();
    await page.getByRole('button', { name: 'More room options' }).click();
    await page.getByRole('menuitem', { name: 'Saved layouts' }).click();
    await page
      .getByRole('textbox', { name: 'Layout name' })
      .fill('Reading corner');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /dimensioned plan/ }).click();
    assert.ok((await downloadPromise).suggestedFilename().endsWith('.svg'));
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: '3D view', exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/auraspace-editor.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/auraspace-editor-mobile.png' });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole('button', { name: 'More room options' }).click();
    await page.getByRole('menuitem', { name: 'Room photos' }).click();
    await page.getByRole('button', { name: /Living Room Sample/ }).click();
    await page
      .getByRole('button', { name: 'Keep item', exact: true })
      .first()
      .click();
    assert.equal(
      await page.getByRole('button', { name: 'In tray', exact: true }).count(),
      1,
    );
    await page
      .getByRole('button', { name: 'Back to my room', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Add furniture', exact: true })
      .click();
    await page.getByRole('button', { name: /Linen sofa.*cm/ }).click();
    await page.getByRole('button', { name: 'Cancel placement' }).click();
    await go('/');
    await page.screenshot({
      path: '/tmp/auraspace-home-mobile.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'New room', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Room name', exact: true })
      .fill('UI test room');
    await page.getByRole('button', { name: 'Create room', exact: true }).click();
    await page.waitForSelector('canvas');
    assert.ok(page.url().includes('/editor/room-'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('textbox', { name: 'Room name', exact: true }).waitFor();
    await go('/editor/sample-living');
    await page.waitForSelector('canvas');
    await page.getByRole('button', { name: 'More room options' }).click();
    await page.getByRole('menuitem', { name: 'Analysis lab' }).click();
    await page
      .getByRole('button', { name: 'Grayscale (BT.601)', exact: true })
      .click();
    await page.getByAltText('Processed', { exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Furniture Removal', exact: true })
      .click();
    await page.getByAltText('Processed', { exact: true }).waitFor();
    await page.waitForTimeout(500);
    const previewUpdated = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('auraspace-studio')).projects.find(
          (p) => p.id === 'sample-living',
        ).updatedAt,
    );
    await page.waitForTimeout(500);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('auraspace-studio')).projects.find(
            (p) => p.id === 'sample-living',
          ).updatedAt,
      ),
      previewUpdated,
      'preview does not trigger a processing loop',
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await go('/editor/nonexistent');
    await page.getByText('Room not found', { exact: true }).waitFor();
    const health = await page.request.get('http://127.0.0.1:3000/api/health');
    assert.equal(health.status(), 200);
    const healthData = await health.json();
    const bad = await page.request.post(
      'http://127.0.0.1:3000/api/vision/inpaint',
      { data: { image: 'bad', boxes: [] } },
    );
    assert.equal(bad.status(), 400);
    const invalidImage = await page.request.post(
      'http://127.0.0.1:3000/api/vision/process',
      { data: { image: 'data:image/png;base64,AAAA', operation: 'edges' } },
    );
    // A connected service validates the image bytes; an unconfigured companion
    // returns its manual-placement fallback before attempting image decoding.
    const invalidBody = await invalidImage.json();
    if (healthData.services.vision === 'connected') {
      assert.equal(invalidImage.status(), 400);
      assert.match(invalidBody.detail, /invalid image/i);
    } else {
      assert.equal(invalidImage.status(), 503);
      assert.match(invalidBody.error, /not configured/i);
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: search, drag without panels, undo/redo, explicit details, placement, layouts, SVG export, mobile layout, sample extraction, creation/reopen, missing room, health, and honest API errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
