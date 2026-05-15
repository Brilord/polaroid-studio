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
  const usesMobileLayout = await page.evaluate(() => window.innerWidth < 1024);

  if (!usesMobileLayout) {
    await expect(page.getByText(expectedStatus).first()).toBeVisible();
  }
  await expect(page.getByAltText('Original upload')).toBeVisible();
  await expect(page.locator('canvas:not(.hidden)').first()).toBeVisible();
}

async function importSampleImage(page: Page, fixture = squareImage) {
  await importImages(page, [fixture]);
}

async function enableAdvancedMode(page: Page) {
  const advancedButtons = page.getByRole('button', { name: 'Advanced mode' });
  if ((await advancedButtons.count()) > 0) {
    await advancedButtons.first().evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
  }
}

async function openExportStep(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('tab', { name: 'Export' }).click();
    return;
  }

  const exportStep = page.getByRole('button', { name: '5 Export' });
  if ((await exportStep.count()) > 0) {
    await exportStep.click();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function expectPreviewCanvasInsideStage(page: Page) {
  await page.waitForTimeout(450);

  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('[aria-label="Polaroid preview stage"]');
    const canvas = document.querySelector('canvas:not(.hidden)');

    if (!stage || !canvas) {
      return null;
    }

    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    return {
      stage: {
        left: stageRect.left,
        top: stageRect.top,
        right: stageRect.right,
        bottom: stageRect.bottom,
      },
      canvas: {
        left: canvasRect.left,
        top: canvasRect.top,
        right: canvasRect.right,
        bottom: canvasRect.bottom,
      },
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.canvas.left).toBeGreaterThanOrEqual(geometry!.stage.left - 1);
  expect(geometry!.canvas.top).toBeGreaterThanOrEqual(geometry!.stage.top - 1);
  expect(geometry!.canvas.right).toBeLessThanOrEqual(geometry!.stage.right + 1);
  expect(geometry!.canvas.bottom).toBeLessThanOrEqual(geometry!.stage.bottom + 1);
}

async function expectNoCriticalAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
}

async function installAudioSpy(page: Page) {
  await page.addInitScript(() => {
    type AudioEvent = { type: string; value?: number };
    const audioEvents: AudioEvent[] = [];

    const createConnectable = () => ({
      connect() {
        return this;
      },
    });

    class MockAudioContext {
      currentTime = 0;
      destination = {};
      sampleRate = 44100;
      state = 'running';

      resume() {
        audioEvents.push({ type: 'resume' });
        return Promise.resolve();
      }

      createGain() {
        audioEvents.push({ type: 'gain' });
        return {
          ...createConnectable(),
          gain: {
            setValueAtTime(value: number) {
              audioEvents.push({ type: 'gain:set', value });
            },
            exponentialRampToValueAtTime(value: number) {
              audioEvents.push({ type: 'gain:ramp', value });
            },
          },
        };
      }

      createOscillator() {
        audioEvents.push({ type: 'oscillator' });
        return {
          ...createConnectable(),
          type: 'sine',
          frequency: {
            setValueAtTime(value: number) {
              audioEvents.push({ type: 'frequency:set', value });
            },
            exponentialRampToValueAtTime(value: number) {
              audioEvents.push({ type: 'frequency:ramp', value });
            },
          },
          start() {
            audioEvents.push({ type: 'oscillator:start' });
          },
          stop() {
            audioEvents.push({ type: 'oscillator:stop' });
          },
        };
      }

      createBuffer(_channels: number, length: number) {
        audioEvents.push({ type: 'buffer' });
        return {
          getChannelData() {
            return new Float32Array(length);
          },
        };
      }

      createBufferSource() {
        audioEvents.push({ type: 'bufferSource' });
        return {
          ...createConnectable(),
          buffer: null,
          start() {
            audioEvents.push({ type: 'bufferSource:start' });
          },
          stop() {
            audioEvents.push({ type: 'bufferSource:stop' });
          },
        };
      }

      createBiquadFilter() {
        audioEvents.push({ type: 'biquadFilter' });
        return {
          ...createConnectable(),
          type: 'lowpass',
          frequency: {
            setValueAtTime(value: number) {
              audioEvents.push({ type: 'filter:set', value });
            },
          },
        };
      }
    }

    Object.defineProperty(window, '__audioEvents', {
      configurable: true,
      value: audioEvents,
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: MockAudioContext,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: MockAudioContext,
    });
  });
  await page.reload();
}

async function getAudioStartCount(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __audioEvents?: Array<{ type: string }>;
        }
      ).__audioEvents?.filter((event) => event.type.endsWith(':start'))
        .length ?? 0
  );
}

async function expectAudioAfter(
  page: Page,
  action: () => Promise<unknown> | unknown
) {
  const before = await getAudioStartCount(page);
  await action();
  await expect.poll(() => getAudioStartCount(page)).toBeGreaterThan(before);
}

test.describe('Polaroid Studio UI and UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads the empty workspace with clear affordances', async ({ page, isMobile }) => {
    await expect(
      page.getByRole('heading', { name: 'Create instant nostalgia.' })
    ).toBeVisible();
    if (!isMobile) {
      await expect(page.getByRole('heading', { name: 'Choose Photo' })).toBeVisible();
    }
    await expect(
      page.getByRole('heading', { name: 'Live Polaroid preview' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Start with a Photo', exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText('Sample looks').filter({ visible: true }).first()).toBeVisible();
    if (!isMobile) {
      await expect(page.getByRole('button', { name: 'Try with sample photo' }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Beginner mode' })).toBeVisible();
    if (!isMobile) {
      await expect(page.getByRole('button', { name: '1 Choose Photo' })).toBeVisible();
      await expect(page.getByRole('button', { name: '5 Export' })).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
  });

  test('persists theme and language UI choices', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.getByLabel('Mobile settings').click();
    }
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
    isMobile,
  }) => {
    await importSampleImage(page, squareImage);
    await expect(page.getByText('Original ratio 1:1; Polaroid crop is 1:1.')).toBeVisible();

    await importSampleImage(page, portraitImage);
    await expect(page.getByText(/Original ratio 1:2; Polaroid crop is 1:1\./)).toBeVisible();

    await importSampleImage(page, landscapeImage);
    await expect(page.getByText(/Original ratio 2:1; Polaroid crop is 1:1\./)).toBeVisible();

    await importSampleImage(page, largeImage);
    await openExportStep(page, isMobile);
    const exportScope = isMobile ? page.getByLabel('Mobile editor panel') : page.getByRole('main');
    await expect(
      exportScope.getByRole('button', {
        name: isMobile ? /Export PNG/ : 'Export PNG Best quality',
      })
    ).toBeEnabled();
    await expect(
      exportScope.getByRole('button', {
        name: isMobile ? /Export JPG/ : 'Export JPG Best for sharing',
      })
    ).toBeEnabled();
    await expect(
      exportScope.getByText(/Export preview: \d+ x \d+px/).filter({ visible: true })
    ).toBeVisible();
  });

  test('shows batch queue and enables batch export from fixture set', async ({
    page,
    isMobile,
  }) => {
    await importImages(page, batchImages);
    await enableAdvancedMode(page);
    if (isMobile) {
      await page.getByRole('tab', { name: 'Export' }).click();
    }

    await expect(page.getByText('Batch queue: 3 photos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export All as PNG' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Export All as JPG' })).toBeEnabled();
  });

  test('supports editing, presets, undo, redo, and preview comparison', async ({
    page,
    isMobile,
  }) => {
    await importSampleImage(page);
    await enableAdvancedMode(page);
    if (isMobile) {
      await page.getByRole('tab', { name: 'Analog looks' }).click();
    }
    const main = page.getByRole('main');
    const controlsScope = isMobile ? main : page;

    await controlsScope.getByLabel('Brightness').fill('110');
    await expect(main.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await main.getByRole('button', { name: /90s Warm Film/ }).click();
    await expect(main.getByRole('button', { name: 'Undo' })).toBeEnabled();

    await main.getByRole('button', { name: 'Undo' }).click();
    await expect(main.getByRole('button', { name: 'Redo' })).toBeEnabled();
    await main.getByRole('button', { name: 'Redo' }).click();

    if (isMobile) {
      await page.getByRole('tab', { name: 'Caption text' }).click();
    }
    const captionScope = isMobile ? page.getByLabel('Mobile editor panel') : main;
    await captionScope
      .getByLabel('Caption text')
      .filter({ visible: true })
      .fill('May 5, 2026');
    await captionScope.getByLabel('Caption font').selectOption('typewriter');
    await expect(captionScope.getByLabel('Caption text')).toHaveValue('May 5, 2026');

    await main.getByRole('button', { name: 'Split' }).click();
    await expect(page.locator('[title="Drag to compare before and after"]')).toBeVisible();
  });

  test('exports PNG and JPG downloads from the browser path', async ({ page, isMobile }) => {
    await importSampleImage(page);
    await openExportStep(page, isMobile);
    const exportScope = isMobile ? page.getByLabel('Mobile editor panel') : page.getByRole('main');

    const [pngDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportScope
        .getByRole('button', {
          name: isMobile ? /Export PNG/ : 'Export PNG Best quality',
        })
        .click(),
    ]);
    expect(pngDownload.suggestedFilename()).toMatch(/^square-polaroid-\d+\.png$/);

    const [jpgDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportScope
        .getByRole('button', {
          name: isMobile ? /Export JPG/ : 'Export JPG Best for sharing',
        })
        .click(),
    ]);
    expect(jpgDownload.suggestedFilename()).toMatch(/^square-polaroid-\d+\.jpg$/);
  });

  test('supports keyboard shortcuts and visible focus movement', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop keyboard shortcuts are covered by the desktop project.');

    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press('ControlOrMeta+O'),
    ]);
    expect(fileChooser).toBeTruthy();

    await importSampleImage(page);
    await enableAdvancedMode(page);
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

  test('plays procedural sounds for core and mapped interactions', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Desktop controls cover the full sound mapping.');

    await installAudioSpy(page);

    await expectAudioAfter(page, () => importSampleImage(page));
    await enableAdvancedMode(page);
    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: /90s Warm Film/ }).click()
    );

    await page.getByLabel('Brightness').fill('110');
    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: 'Undo' }).click()
    );
    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: 'Redo' }).click()
    );

    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: 'Split' }).click()
    );
    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: /Large/ }).click()
    );
    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: 'Black' }).click()
    );
    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: 'Auto fit' }).first().click()
    );

    const canvas = page.locator('[title="Drag to reposition the photo crop"]');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await expectAudioAfter(page, async () => {
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
        clientX: canvasBox!.x + canvasBox!.width / 2 + 60,
        clientY: canvasBox!.y + canvasBox!.height / 2,
        button: 0,
        buttons: 1,
        pointerType: 'mouse',
      });
      await canvas.dispatchEvent('pointerup', {
        pointerId: 1,
        clientX: canvasBox!.x + canvasBox!.width / 2 + 60,
        clientY: canvasBox!.y + canvasBox!.height / 2,
        button: 0,
        buttons: 0,
        pointerType: 'mouse',
      });
    });

    await expectAudioAfter(page, async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Export PNG/ }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^square-polaroid-\d+\.png$/);
    });
  });

  test('respects the sound toggle and plays errors only while sound is enabled', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Sound toggle behavior is shared across layouts.');

    await installAudioSpy(page);

    await expectAudioAfter(page, () =>
      page.getByRole('button', { name: 'Sound on' }).click()
    );
    const countAfterDisabling = await getAudioStartCount(page);

    await importSampleImage(page);
    await expect.poll(() => getAudioStartCount(page)).toBe(countAfterDisabling);

    await page.getByRole('button', { name: 'Sound off' }).click();
    const countBeforeError = await getAudioStartCount(page);
    await page.getByLabel('Image files').setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a supported image'),
    });
    await expect.poll(() => getAudioStartCount(page)).toBeGreaterThan(countBeforeError);
  });

  test('supports dragging the crop and split comparison handles', async ({
    page,
    isMobile,
  }) => {
    await importSampleImage(page, landscapeImage);
    await enableAdvancedMode(page);
    const main = page.getByRole('main');

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
    await expect(main.getByRole('button', { name: 'Undo' })).toBeEnabled();

    if (isMobile) {
      return;
    }

    await main.getByRole('button', { name: 'Split' }).click();
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
    isMobile,
  }) => {
    await expect(page).toHaveScreenshot('empty-workspace.png', {
      fullPage: true,
    });

    if (isMobile) {
      await page.getByLabel('Mobile settings').click();
    }
    await page.getByRole('button', { name: 'Dark mode' }).click();
    await expect(page).toHaveScreenshot('dark-workspace.png', {
      fullPage: true,
    });

    await importSampleImage(page, portraitImage);
    if (isMobile) {
      await page.getByRole('tab', { name: 'Caption' }).click();
    } else {
      await page.getByRole('button', { name: '4 Caption' }).click();
    }
    const captionScope = isMobile
      ? page.getByLabel('Mobile editor panel')
      : page.getByRole('main');
    await captionScope
      .getByLabel('Caption text')
      .filter({ visible: true })
      .fill('May 5, 2026');
    await expect(page).toHaveScreenshot('loaded-workspace.png', {
      fullPage: true,
    });
  });

  test('keeps the core workflow usable on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await expect(page.getByRole('button', { name: 'Start with a Photo', exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Live Polaroid preview' })
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Pick Look' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test.describe('mobile UI UX self-checks', () => {
    test.skip(({ isMobile }) => !isMobile, 'Mobile layout checks only run on mobile projects.');

    test('uses compact mobile navigation and demotes desktop-only chrome', async ({
      page,
    }) => {
      await expect(page.getByLabel('Mobile settings')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Dark mode' })).toBeHidden();
      await expect(page.getByLabel('Workflow guide')).toBeHidden();
      await expect(page.getByLabel('Mobile export actions')).toBeHidden();

      await page.getByLabel('Mobile settings').click();
      await expect(page.getByRole('button', { name: 'Dark mode' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'KO' })).toBeVisible();

      const mobileTabs = page.getByRole('tablist', {
        name: 'Mobile editor sections',
      });
      await expect(mobileTabs).toBeVisible();
      await expect(
        mobileTabs.getByRole('tab', { name: 'Pick Look' })
      ).toHaveAttribute('aria-selected', 'true');
      await expect(mobileTabs.getByRole('tab', { name: 'Crop' })).toBeVisible();
      await expect(mobileTabs.getByRole('tab', { name: 'Caption' })).toBeVisible();
      await expect(mobileTabs.getByRole('tab', { name: 'Export' })).toBeVisible();

      await enableAdvancedMode(page);
      await expect(
        mobileTabs.getByRole('tab', { name: 'Analog looks' })
      ).toBeVisible();
      await expect(
        mobileTabs.getByRole('tab', { name: 'Frame theme' })
      ).toBeVisible();
      await expect(
        mobileTabs.getByRole('tab', { name: 'Caption text' })
      ).toBeVisible();
      await expect(mobileTabs.getByRole('tab', { name: 'Export' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test('collapses upload after import and keeps the preview compact while scrolling', async ({
      page,
    }) => {
      await importSampleImage(page);
      await expectPreviewCanvasInsideStage(page);

      await expect(page.getByRole('button', { name: 'Change Photo' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Start with a photo' })).toBeHidden();

      const stage = page.getByLabel('Polaroid preview stage');
      const heightBefore = await stage.evaluate((node) =>
        (node as HTMLElement).getBoundingClientRect().height
      );

      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(250);
      await expect(page.getByRole('tab', { name: 'Pick Look' })).toBeVisible();

      const heightAfter = await stage.evaluate((node) =>
        (node as HTMLElement).getBoundingClientRect().height
      );
      expect(heightAfter).toBeLessThan(heightBefore);
      await expectPreviewCanvasInsideStage(page);
    });

    test('keeps preview sticky while editing crop controls', async ({ page }) => {
      await importSampleImage(page, landscapeImage);
      await enableAdvancedMode(page);
      const mobileEditor = page.getByRole('main');

      await page.getByRole('tab', { name: 'Crop' }).click();
      await expect(mobileEditor.getByLabel('Vertical')).toBeVisible();
      await page.mouse.wheel(0, 850);

      const canvas = page.locator('[title="Drag to reposition the photo crop"]');
      await expect(canvas).toBeVisible();
      await expect(mobileEditor.getByLabel('Crop rotation')).toBeVisible();

      const geometry = await canvas.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          viewportHeight: window.innerHeight,
        };
      });

      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.top).toBeLessThan(geometry.viewportHeight * 0.45);
      expect(geometry.bottom).toBeGreaterThan(geometry.viewportHeight * 0.12);
      await expectNoHorizontalOverflow(page);
    });

    test('exposes tabbed mobile controls without dumping every panel at once', async ({
      page,
    }) => {
      await importSampleImage(page, portraitImage);
      await enableAdvancedMode(page);
      const mobileEditor = page.getByLabel('Mobile editor panel');

      await page.getByRole('tab', { name: 'Quick mode' }).click();
      await expect(
        mobileEditor.getByText('Pick a look, crop, export.')
      ).toBeVisible();
      await expect(mobileEditor.getByRole('button', { name: 'Next' })).toBeVisible();
      await expect(mobileEditor.getByLabel('Watermark / signature')).toBeHidden();

      await page.getByRole('tab', { name: 'Frame theme' }).click();
      await expect(mobileEditor.getByText('Texture')).toBeVisible();
      await expect(mobileEditor.getByLabel('Bottom border')).toBeVisible();
      await expect(
        mobileEditor.getByText('Pick a look, crop, export.')
      ).toBeHidden();

      await page.getByRole('tab', { name: 'Caption text' }).click();
      await expect(mobileEditor.getByLabel('Caption text')).toBeVisible();
      await expect(mobileEditor.getByLabel('Watermark / signature')).toBeVisible();
      await expect(mobileEditor.getByText('Export preview:')).toBeHidden();

      await page.getByRole('tab', { name: 'Export' }).click();
      await expect(
        mobileEditor.getByText(/Export preview: \d+ x \d+px/)
      ).toBeVisible();
      await expect(
        mobileEditor.getByRole('button', { name: 'Export All as PNG' })
      ).toBeVisible();
    });

    test('shows sticky mobile export actions after import', async ({ page }) => {
      await expect(page.getByLabel('Mobile export actions')).toBeHidden();

      await importSampleImage(page);

      const exportBar = page.getByLabel('Mobile export actions');
      await expect(exportBar).toBeVisible();
      await expect(exportBar.getByRole('button', { name: 'Undo' })).toBeVisible();
      await expect(exportBar.getByRole('button', { name: 'Export' })).toBeVisible();
      await expect(exportBar.getByRole('button', { name: 'Next' })).toBeVisible();

      await exportBar.getByRole('button', { name: 'Export' }).click();
      await expect(exportBar.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
      await expect(exportBar.getByRole('button', { name: 'Export JPG' })).toBeEnabled();
      await expect(exportBar.getByRole('button', { name: 'Copy' })).toBeHidden();

      const barBox = await exportBar.boundingBox();
      const viewport = page.viewportSize();
      expect(barBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(barBox!.y + barBox!.height).toBeGreaterThanOrEqual(
        viewport!.height - 2
      );
      const paddingBottom = await exportBar.evaluate((node) =>
        getComputedStyle(node as HTMLElement).paddingBottom
      );
      expect(Number.parseFloat(paddingBottom)).toBeGreaterThanOrEqual(12);
    });

    test('advances beginner flow and persists the last mobile tab', async ({ page }) => {
      await importSampleImage(page);
      const mobileTabs = page.getByRole('tablist', {
        name: 'Mobile editor sections',
      });

      await page.getByLabel('Mobile editor panel').getByRole('button', { name: 'Next' }).click();
      await expect(mobileTabs.getByRole('tab', { name: 'Crop' })).toHaveAttribute(
        'aria-selected',
        'true'
      );

      await mobileTabs.getByRole('tab', { name: 'Caption' }).click();
      await page.reload();
      await expect(
        page.getByRole('tablist', { name: 'Mobile editor sections' }).getByRole(
          'tab',
          { name: 'Caption' }
        )
      ).toHaveAttribute('aria-selected', 'true');
    });

    test('supports pinch-to-zoom on the mobile preview', async ({ page }) => {
      await importSampleImage(page);
      const mobileEditor = page.getByLabel('Mobile editor panel');
      await page.getByRole('tab', { name: 'Crop' }).click();

      const zoomBefore = await mobileEditor.getByLabel('Zoom').inputValue();
      const canvas = page.locator('[title="Drag to reposition the photo crop"]');
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();

      await canvas.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const createTouch = (identifier: number, xOffset: number) =>
          new Touch({
            identifier,
            target: node,
            clientX: rect.left + rect.width / 2 + xOffset,
            clientY: rect.top + rect.height / 2,
          });
        const dispatchTouch = (type: string, touches: Touch[]) => {
          node.dispatchEvent(
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches,
              targetTouches: touches,
              changedTouches: touches,
            })
          );
        };

        dispatchTouch('touchstart', [createTouch(1, -20), createTouch(2, 20)]);
        dispatchTouch('touchmove', [createTouch(1, -20), createTouch(2, 80)]);
        dispatchTouch('touchend', []);
      });

      await expect
        .poll(() => mobileEditor.getByLabel('Zoom').inputValue())
        .not.toBe(zoomBefore);
    });

    test('uses touch-friendly crop resize handles', async ({ page }) => {
      await importSampleImage(page);

      const resizeHandles = page.getByRole('button', {
        name: 'Resize photo crop',
      });
      await expect(resizeHandles).toHaveCount(4);

      for (const handle of await resizeHandles.all()) {
        const box = await handle.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });
  });
});
