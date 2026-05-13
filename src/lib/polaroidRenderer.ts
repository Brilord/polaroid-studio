import { ExportSettings, PolaroidSettings } from '../types';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type RenderImage = CanvasImageSource & {
  naturalWidth?: number;
  naturalHeight?: number;
  width: number;
  height: number;
};

type RenderOptions = {
  scale?: number;
  applyEffects?: boolean;
  seed?: string | number;
};

function createCanvas(width: number, height: number) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2dContext(canvas: RenderCanvas) {
  return canvas.getContext('2d') as RenderContext | null;
}

function getImageWidth(image: RenderImage) {
  return image.naturalWidth ?? image.width;
}

function getImageHeight(image: RenderImage) {
  return image.naturalHeight ?? image.height;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string | number) {
  let state =
    typeof seed === 'number' ? seed >>> 0 : hashString(seed || 'polaroid-studio');
  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getRenderSeed(
  image: RenderImage,
  settings: PolaroidSettings,
  options: RenderOptions
) {
  return JSON.stringify({
    imageWidth: getImageWidth(image),
    imageHeight: getImageHeight(image),
    settings,
    scale: options.scale ?? 1,
    applyEffects: options.applyEffects ?? true,
    seed: options.seed ?? 'default',
  });
}

function roundedRect(
  ctx: RenderContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function applyToneAdjustments(
  ctx: RenderContext,
  width: number,
  height: number,
  settings: PolaroidSettings,
  random: () => number
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const warmth = settings.warmth / 100;
  const fade = settings.fade / 100;
  const grain = settings.grain / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r += 28 * warmth;
    g += 10 * warmth;
    b -= 24 * warmth;

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r += (235 - luminance) * 0.22 * fade;
    g += (228 - luminance) * 0.18 * fade;
    b += (214 - luminance) * 0.14 * fade;

    if (grain > 0) {
      const noise = (random() - 0.5) * 90 * grain;
      r += noise;
      g += noise * 0.9;
      b += noise * 0.75;
    }

    data[i] = clamp(r, 0, 255);
    data[i + 1] = clamp(g, 0, 255);
    data[i + 2] = clamp(b, 0, 255);
  }

  ctx.putImageData(imageData, 0, 0);
}

function drawPhoto(
  image: RenderImage,
  settings: PolaroidSettings,
  photoSize: number,
  applyEffects: boolean,
  random: () => number
) {
  const canvas = createCanvas(photoSize, photoSize);
  const ctx = get2dContext(canvas);

  if (!ctx) {
    throw new Error('Could not initialize photo canvas.');
  }

  const imageWidth = getImageWidth(image);
  const imageHeight = getImageHeight(image);
  const coverScale = Math.max(
    photoSize / imageWidth,
    photoSize / imageHeight
  );
  const zoom = clamp(settings.cropZoom, 1, 3);
  const drawWidth = imageWidth * coverScale * zoom;
  const drawHeight = imageHeight * coverScale * zoom;
  const minX = photoSize - drawWidth;
  const minY = photoSize - drawHeight;
  const offsetX = minX * ((settings.cropX + 100) / 200);
  const offsetY = minY * ((settings.cropY + 100) / 200);

  if (applyEffects) {
    ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%) blur(${settings.blur}px)`;
  }

  ctx.save();
  ctx.translate(photoSize / 2, photoSize / 2);
  ctx.rotate((settings.cropRotation * Math.PI) / 180);
  ctx.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1);
  ctx.drawImage(
    image,
    offsetX - photoSize / 2,
    offsetY - photoSize / 2,
    drawWidth,
    drawHeight
  );
  ctx.restore();
  ctx.filter = 'none';

  if (applyEffects) {
    applyToneAdjustments(ctx, photoSize, photoSize, settings, random);

    if (settings.vignette > 0) {
      const vignette = ctx.createRadialGradient(
        photoSize / 2,
        photoSize / 2,
        photoSize * 0.3,
        photoSize / 2,
        photoSize / 2,
        photoSize * 0.72
      );
      const alpha = settings.vignette / 180;
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, `rgba(50, 28, 15, ${alpha})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, photoSize, photoSize);
    }
  }

  return canvas;
}

function drawPaperTexture(
  ctx: RenderContext,
  cardWidth: number,
  cardHeight: number,
  theme: PolaroidSettings['frameTheme'],
  random: () => number
) {
  const themes: Record<PolaroidSettings['frameTheme'], [string, string, string]> = {
    white: ['#fffdfa', '#f8f2e8', '#efe6d8'],
    cream: ['#fff4db', '#f0dfbf', '#dcc9a7'],
    black: ['#24211f', '#161413', '#090807'],
    aged: ['#efe1bf', '#d8bf8f', '#b99b67'],
    pink: ['#ffeaf0', '#ffd1dc', '#f5b8c7'],
    blue: ['#e8f3ff', '#c9def3', '#a8c2da'],
    green: ['#edf6e7', '#d6e6ca', '#bbd2aa'],
  };
  const palette = themes[theme] ?? themes.white;
  const gradient = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.52, palette[1]);
  gradient.addColorStop(1, palette[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  const specks = Math.max(120, Math.floor((cardWidth * cardHeight) / 3600));
  for (let i = 0; i < specks; i += 1) {
    const x = random() * cardWidth;
    const y = random() * cardHeight;
    const alpha = random() * 0.05;
    const shade = 235 + random() * 16;
    ctx.fillStyle = `rgba(${shade}, ${shade - 3}, ${shade - 8}, ${alpha})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  const glow = ctx.createRadialGradient(
    cardWidth * 0.2,
    cardHeight * 0.12,
    0,
    cardWidth * 0.2,
    cardHeight * 0.12,
    cardWidth * 0.7
  );
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cardWidth, cardHeight);
}

function getFrameGeometry(photoSize: number, settings: PolaroidSettings) {
  const sideBorder = Math.round(photoSize * (settings.borderSide / 100));
  const topBorder = Math.round(photoSize * (settings.borderTop / 100));
  const bottomBorder = Math.round(photoSize * (settings.borderBottom / 100));
  const cardWidth = photoSize + sideBorder * 2;
  const cardHeight = photoSize + topBorder + bottomBorder;

  return {
    sideBorder,
    topBorder,
    bottomBorder,
    cardWidth,
    cardHeight,
  };
}

export function getAutoCropZoom(
  image: HTMLImageElement,
  settings: PolaroidSettings
) {
  const photoSize = 820;
  const coverScale = Math.max(
    photoSize / image.naturalWidth,
    photoSize / image.naturalHeight
  );
  const baseDrawWidth = image.naturalWidth * coverScale;
  const baseDrawHeight = image.naturalHeight * coverScale;
  const angle = (settings.cropRotation * Math.PI) / 180;
  const rotatedSquareSpan = photoSize * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
  const neededZoom = Math.max(
    1,
    rotatedSquareSpan / baseDrawWidth,
    rotatedSquareSpan / baseDrawHeight
  );

  return clamp(Math.ceil(neededZoom * 100) / 100, 1, 3);
}

function drawOverlay(
  ctx: RenderContext,
  photoX: number,
  photoY: number,
  photoSize: number,
  cardWidth: number,
  cardHeight: number,
  settings: PolaroidSettings,
  safeScale: number,
  random: () => number
) {
  if (settings.overlay === 'none') {
    return;
  }

  if (settings.overlay === 'tape') {
    ctx.save();
    ctx.translate(cardWidth * 0.18, photoY - 12 * safeScale);
    ctx.rotate(-0.14);
    ctx.fillStyle = 'rgba(237, 204, 151, 0.72)';
    ctx.fillRect(0, 0, cardWidth * 0.34, 42 * safeScale);
    ctx.strokeStyle = 'rgba(111, 80, 44, 0.14)';
    ctx.strokeRect(0, 0, cardWidth * 0.34, 42 * safeScale);
    ctx.restore();

    ctx.save();
    ctx.translate(cardWidth * 0.56, photoY + photoSize - 16 * safeScale);
    ctx.rotate(0.1);
    ctx.fillStyle = 'rgba(237, 204, 151, 0.62)';
    ctx.fillRect(0, 0, cardWidth * 0.28, 38 * safeScale);
    ctx.strokeStyle = 'rgba(111, 80, 44, 0.12)';
    ctx.strokeRect(0, 0, cardWidth * 0.28, 38 * safeScale);
    ctx.restore();
    return;
  }

  if (settings.overlay === 'lightleak') {
    const leak = ctx.createRadialGradient(
      photoX + photoSize * 0.08,
      photoY + photoSize * 0.18,
      0,
      photoX + photoSize * 0.08,
      photoY + photoSize * 0.18,
      photoSize * 0.68
    );
    leak.addColorStop(0, 'rgba(255, 86, 40, 0.36)');
    leak.addColorStop(0.46, 'rgba(255, 181, 72, 0.16)');
    leak.addColorStop(1, 'rgba(255, 181, 72, 0)');
    ctx.fillStyle = leak;
    ctx.fillRect(photoX, photoY, photoSize, photoSize);
    return;
  }

  if (settings.overlay === 'fingerprints') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2 * safeScale;
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.ellipse(
        photoX + photoSize * 0.72,
        photoY + photoSize * 0.28,
        (24 + i * 8) * safeScale,
        (38 + i * 9) * safeScale,
        0.42,
        0.2,
        Math.PI * 1.52
      );
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(photoX, photoY, photoSize, photoSize);
  ctx.clip();

  if (settings.overlay === 'dust') {
    for (let i = 0; i < 120; i += 1) {
      const size = (random() * 1.8 + 0.4) * safeScale;
      ctx.fillStyle = `rgba(255,255,255,${random() * 0.28})`;
      ctx.fillRect(
        photoX + random() * photoSize,
        photoY + random() * photoSize,
        size,
        size
      );
    }
  }

  if (settings.overlay === 'scratches') {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.2 * safeScale;
    for (let i = 0; i < 12; i += 1) {
      const x = photoX + random() * photoSize;
      const y = photoY + random() * photoSize;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + (random() * 40 - 20) * safeScale,
        y + (80 + random() * 220) * safeScale
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawWrappedCaption(
  ctx: RenderContext,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const lines = text
    .split('\n')
    .flatMap((line) => {
      const words = line.split(/\s+/);
      const wrapped: string[] = [];
      let current = '';
      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && current) {
          wrapped.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      wrapped.push(current);
      return wrapped;
    })
    .filter(Boolean);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + index * lineHeight, maxWidth);
  });
}

function getCaptionFontFamily(font: string) {
  switch (font) {
    case 'typewriter':
      return '"Courier New", "Courier Prime", monospace';
    case 'marker':
      return '"Trebuchet MS", "Segoe Print", cursive';
    case 'clean':
      return '"Avenir Next", "Segoe UI", sans-serif';
    default:
      return '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  }
}

export function renderPolaroid(
  target: RenderCanvas,
  image: RenderImage,
  settings: PolaroidSettings,
  options: RenderOptions = {}
) {
  const safeScale = Math.max(0.5, options.scale ?? 1);
  const applyEffects = options.applyEffects ?? true;
  const photoSize = Math.round(820 * safeScale);
  const { sideBorder, topBorder, bottomBorder, cardWidth, cardHeight } =
    getFrameGeometry(photoSize, settings);
  const shadowPad = Math.round(120 * safeScale);

  target.width = cardWidth + shadowPad * 2;
  target.height = cardHeight + shadowPad * 2;

  const ctx = get2dContext(target);
  if (!ctx) {
    throw new Error('Could not initialize preview canvas.');
  }

  ctx.clearRect(0, 0, target.width, target.height);

  const cardCanvas = createCanvas(cardWidth, cardHeight);
  const cardCtx = get2dContext(cardCanvas);
  if (!cardCtx) {
    throw new Error('Could not initialize card canvas.');
  }

  const random = createSeededRandom(getRenderSeed(image, settings, options));

  cardCtx.save();
  roundedRect(cardCtx, 0, 0, cardWidth, cardHeight, 22 * safeScale);
  cardCtx.clip();
  drawPaperTexture(cardCtx, cardWidth, cardHeight, settings.frameTheme, random);

  const photoCanvas = drawPhoto(image, settings, photoSize, applyEffects, random);
  const photoX = sideBorder;
  const photoY = topBorder;
  cardCtx.save();
  roundedRect(cardCtx, photoX, photoY, photoSize, photoSize, 10 * safeScale);
  cardCtx.clip();
  cardCtx.drawImage(photoCanvas, photoX, photoY);
  cardCtx.restore();

  drawOverlay(
    cardCtx,
    photoX,
    photoY,
    photoSize,
    cardWidth,
    cardHeight,
    settings,
    safeScale,
    random
  );

  cardCtx.strokeStyle = 'rgba(123, 93, 66, 0.08)';
  cardCtx.lineWidth = 2 * safeScale;
  roundedRect(
    cardCtx,
    photoX - 1 * safeScale,
    photoY - 1 * safeScale,
    photoSize + 2 * safeScale,
    photoSize + 2 * safeScale,
    12 * safeScale
  );
  cardCtx.stroke();

  if (settings.captionText.trim()) {
    const baseline = photoY + photoSize + bottomBorder * 0.56;
    cardCtx.fillStyle =
      settings.frameTheme === 'black' && settings.captionColor === '#362d23'
        ? 'rgba(245, 238, 225, 0.9)'
        : settings.captionColor;
    cardCtx.font = `${Math.round(
      settings.captionFontSize * safeScale
    )}px ${getCaptionFontFamily(settings.captionFont)}`;
    cardCtx.textAlign = settings.captionAlign;
    cardCtx.textBaseline = 'middle';
    const captionWidth = cardWidth * 0.82;
    const captionX =
      settings.captionAlign === 'left'
        ? cardWidth * 0.12
        : settings.captionAlign === 'right'
          ? cardWidth * 0.88
          : cardWidth / 2;
    drawWrappedCaption(
      cardCtx,
      settings.captionText,
      captionX,
      baseline,
      captionWidth,
      settings.captionFontSize * safeScale * 1.18
    );
  }

  if (settings.watermarkText.trim()) {
    cardCtx.save();
    cardCtx.fillStyle = `rgba(60, 48, 36, ${clamp(settings.watermarkOpacity, 0, 100) / 100})`;
    cardCtx.font = `${Math.round(15 * safeScale)}px "Avenir Next", "Segoe UI", sans-serif`;
    cardCtx.textAlign = 'right';
    cardCtx.textBaseline = 'bottom';
    cardCtx.fillText(settings.watermarkText, cardWidth - sideBorder * 0.55, cardHeight - 12 * safeScale, cardWidth * 0.55);
    cardCtx.restore();
  }

  cardCtx.restore();

  ctx.save();
  ctx.translate(target.width / 2, target.height / 2);
  ctx.rotate((settings.rotation * Math.PI) / 180);

  const shadowStrength = settings.shadowIntensity / 100;
  ctx.shadowColor = `rgba(51, 34, 18, ${0.18 * shadowStrength})`;
  ctx.shadowBlur = 40 * safeScale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 18 * safeScale;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
  ctx.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);

  ctx.shadowColor = `rgba(28, 20, 12, ${0.22 * shadowStrength})`;
  ctx.shadowBlur = 85 * safeScale;
  ctx.shadowOffsetY = 28 * safeScale;
  ctx.drawImage(cardCanvas, -cardWidth / 2, -cardHeight / 2);
  ctx.restore();
}

export function getExportDimensions(
  settings: PolaroidSettings,
  exportSettings: ExportSettings
) {
  const safeScale = Math.max(0.5, exportSettings.scale ?? 1);
  const photoSize = Math.round(820 * safeScale);
  const { cardWidth, cardHeight } = getFrameGeometry(photoSize, settings);
  const shadowPad = Math.round(120 * safeScale);
  return {
    width: cardWidth + shadowPad * 2,
    height: cardHeight + shadowPad * 2,
  };
}

export async function exportCanvasBlob(
  image: RenderImage,
  settings: PolaroidSettings,
  format: 'png' | 'jpg',
  exportSettings: ExportSettings,
  seed?: string | number
) {
  const exportCanvas = createCanvas(1, 1);
  renderPolaroid(exportCanvas, image, settings, {
    scale: exportSettings.scale,
    applyEffects: true,
    seed,
  });

  const jpegQuality = clamp(exportSettings.quality, 50, 100) / 100;

  if (format === 'jpg') {
    const flattenedCanvas = createCanvas(exportCanvas.width, exportCanvas.height);
    const flattenedCtx = get2dContext(flattenedCanvas);

    if (!flattenedCtx) {
      throw new Error('Could not initialize export canvas.');
    }

    flattenedCtx.fillStyle = '#f2e9dd';
    flattenedCtx.fillRect(0, 0, flattenedCanvas.width, flattenedCanvas.height);
    flattenedCtx.drawImage(exportCanvas, 0, 0);

    return canvasToBlob(flattenedCanvas, 'image/jpeg', jpegQuality);
  }

  return canvasToBlob(exportCanvas, 'image/png');
}

function canvasToBlob(canvas: RenderCanvas, type: string, quality?: number) {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to render export blob.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}
