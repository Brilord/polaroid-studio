import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  batchImages,
  landscapeImage,
  largeImage,
  portraitImage,
  squareImage,
  type ImageFixture,
} from '../fixtures/images';

async function importImages(page: Page, fixtures: ImageFixture[]) {
  await page.getByLabel('Image files').setInputFiles(
    fixtures.map((fixture) => ({
      name: fixture.name,
      mimeType: fixture.mimeType,
      buffer: fixture.buffer,
    }))
  );

  const expectedStatus =
    fixtures.length === 1
      ? `Loaded ${fixtures[0].name}`
      : `Loaded ${fixtures.length} photos for batch export.`;

  await expect(page.getByText(expectedStatus)).toBeVisible();
  await expect(page.getByAltText('Original upload')).toBeVisible();
  await expect(page.locator('canvas:not(.hidden)').first()).toBeVisible();
}

async function importSampleImage(page: Page, fixture = squareImage) {
  await importImages(page, [fixture]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function expectNoCriticalAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();

  expect(results.violations).toEqual([]);
}

test.describe('Polaroid Studio UI and UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads the empty workspace with clear affordances', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Create instant nostalgia.' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Drag in images' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Live Polaroid preview' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Files' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Native Picker' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Export JPG' })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
  });

  test('persists theme and language UI choices', async ({ page }) => {
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page.getByRole('button', { name: 'Light mode' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('polaroid-studio-theme')))
      .toBe('dark');

    await page.getByRole('button', { name: 'KO' }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe('ko');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('polaroid-studio-language')))
      .toBe('ko');

    await page.reload();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe('ko');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('polaroid-studio-theme')))
      .toBe('dark');
  });

  test('imports square, portrait, landscape, and large image fixtures', async ({
    page,
  }) => {
    await importSampleImage(page, squareImage);
    await expect(page.getByText('Original ratio 1:1; Polaroid crop is 1:1.')).toBeVisible();

    await importSampleImage(page, portraitImage);
    await expect(page.getByText(/Original ratio 1:2; Polaroid crop is 1:1\./)).toBeVisible();

    await importSampleImage(page, landscapeImage);
    await expect(page.getByText(/Original ratio 2:1; Polaroid crop is 1:1\./)).toBeVisible();

    await importSampleImage(page, largeImage);
    await expect(page.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Export JPG' })).toBeEnabled();
    await expect(page.getByText(/Export preview: \d+ x \d+px/)).toBeVisible();
  });

  test('shows batch queue and enables batch export from fixture set', async ({
    page,
  }) => {
    await importImages(page, batchImages);

    await expect(page.getByText('Batch queue: 3 photos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Batch PNG' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Batch JPG' })).toBeEnabled();
  });

  test('supports editing, presets, undo, redo, and preview comparison', async ({
    page,
  }) => {
    await importSampleImage(page);

    await page.getByLabel('Brightness').fill('110');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: /90s Warm Film/ }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
    await page.getByRole('button', { name: 'Redo' }).click();

    await page.getByLabel('Caption text').fill('May 5, 2026');
    await page.getByLabel('Caption font').selectOption('typewriter');
    await expect(page.getByLabel('Caption text')).toHaveValue('May 5, 2026');

    await page.getByRole('button', { name: 'Split' }).click();
    await expect(page.locator('[title="Drag to compare before and after"]')).toBeVisible();
  });

  test('exports PNG and JPG downloads from the browser path', async ({ page }) => {
    await importSampleImage(page);

    const [pngDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PNG' }).click(),
    ]);
    expect(pngDownload.suggestedFilename()).toMatch(/^square-polaroid-\d+\.png$/);

    const [jpgDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JPG' }).click(),
    ]);
    expect(jpgDownload.suggestedFilename()).toMatch(/^square-polaroid-\d+\.jpg$/);
  });

  test('supports keyboard shortcuts and visible focus movement', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+O');
    await expect(
      page.getByText('Use Choose Files to import photos on this platform.')
    ).toBeVisible();

    await importSampleImage(page);
    await page.getByLabel('Brightness').fill('108');
    await page.locator('main').click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.keyboard.press('ControlOrMeta+Z');
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();

    await page.keyboard.press('ControlOrMeta+Shift+Z');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('ControlOrMeta+S'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^square-polaroid-\d+\.png$/);
  });

  test('supports dragging the crop and split comparison handles', async ({ page }) => {
    await importSampleImage(page, landscapeImage);

    const cropYBefore = await page.getByLabel('Vertical').inputValue();
    const canvas = page.locator('[title="Drag to reposition the photo crop"]');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    await canvas.dispatchEvent('pointerdown', {
      pointerId: 1,
      clientX: canvasBox!.x + canvasBox!.width / 2,
      clientY: canvasBox!.y + canvasBox!.height / 2,
      button: 0,
      buttons: 1,
      pointerType: 'mouse',
    });
    await canvas.dispatchEvent('pointermove', {
      pointerId: 1,
      clientX: canvasBox!.x + canvasBox!.width / 2,
      clientY: canvasBox!.y + canvasBox!.height / 2 + 90,
      button: 0,
      buttons: 1,
      pointerType: 'mouse',
    });
    await canvas.dispatchEvent('pointerup', {
      pointerId: 1,
      clientX: canvasBox!.x + canvasBox!.width / 2,
      clientY: canvasBox!.y + canvasBox!.height / 2 + 90,
      button: 0,
      buttons: 0,
      pointerType: 'mouse',
    });

    await expect
      .poll(() => page.getByLabel('Vertical').inputValue())
      .not.toBe(cropYBefore);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await page.getByRole('button', { name: 'Split' }).click();
    const splitHandle = page.locator('[title="Drag to compare before and after"]');
    const splitBefore = await splitHandle.evaluate((node) =>
      getComputedStyle(node as HTMLElement).left
    );
    const splitBox = await splitHandle.boundingBox();
    expect(splitBox).not.toBeNull();

    await page.mouse.move(splitBox!.x + splitBox!.width / 2, splitBox!.y + 20);
    await page.mouse.down();
    await page.mouse.move(splitBox!.x + 80, splitBox!.y + 20);
    await page.mouse.up();

    await expect
      .poll(() =>
        splitHandle.evaluate((node) => getComputedStyle(node as HTMLElement).left)
      )
      .not.toBe(splitBefore);
  });

  test('has no critical accessibility violations on empty and loaded states', async ({
    page,
  }) => {
    await expectNoCriticalAccessibilityViolations(page);

    await importSampleImage(page);
    await expectNoCriticalAccessibilityViolations(page);
  });

  test('matches visual snapshots for empty, dark, and loaded states', async ({
    page,
  }) => {
    await expect(page).toHaveScreenshot('empty-workspace.png', {
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page).toHaveScreenshot('dark-workspace.png', {
      fullPage: true,
    });

    await importSampleImage(page, portraitImage);
    await page.getByLabel('Caption text').fill('May 5, 2026');
    await expect(page).toHaveScreenshot('loaded-workspace.png', {
      fullPage: true,
    });
  });

  test('keeps the core workflow usable on a phone viewport', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Choose Files' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Live Polaroid preview' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PNG' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
