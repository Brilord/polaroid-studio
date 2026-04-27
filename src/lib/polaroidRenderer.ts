import { ExportSettings, PolaroidSettings } from '../types';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type RenderOptions = {
  scale?: number;
  applyEffects?: boolean;
};

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
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
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: PolaroidSettings
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
      const noise = (Math.random() - 0.5) * 90 * grain;
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
  image: HTMLImageElement,
  settings: PolaroidSettings,
  photoSize: number,
  applyEffects: boolean
) {
  const canvas = createCanvas(photoSize, photoSize);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not initialize photo canvas.');
  }

  const coverScale = Math.max(
    photoSize / image.naturalWidth,
    photoSize / image.naturalHeight
  );
  const zoom = clamp(settings.cropZoom, 1, 3);
  const drawWidth = image.naturalWidth * coverScale * zoom;
  const drawHeight = image.naturalHeight * coverScale * zoom;
  const minX = photoSize - drawWidth;
  const minY = photoSize - drawHeight;
  const offsetX = minX * ((settings.cropX + 100) / 200);
  const offsetY = minY * ((settings.cropY + 100) / 200);

  if (applyEffects) {
    ctx.filter = `brightness(${settings.brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%) blur(${settings.blur}px)`;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  ctx.filter = 'none';

  if (applyEffects) {
    applyToneAdjustments(ctx, photoSize, photoSize, settings);

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
  ctx: CanvasRenderingContext2D,
  cardWidth: number,
  cardHeight: number
) {
  const gradient = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
  gradient.addColorStop(0, '#fffdfa');
  gradient.addColorStop(0.52, '#f8f2e8');
  gradient.addColorStop(1, '#efe6d8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  const specks = Math.max(120, Math.floor((cardWidth * cardHeight) / 3600));
  for (let i = 0; i < specks; i += 1) {
    const x = Math.random() * cardWidth;
    const y = Math.random() * cardHeight;
    const alpha = Math.random() * 0.05;
    const shade = 235 + Math.random() * 16;
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
  target: HTMLCanvasElement,
  image: HTMLImageElement,
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

  const ctx = target.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize preview canvas.');
  }

  ctx.clearRect(0, 0, target.width, target.height);

  const cardCanvas = createCanvas(cardWidth, cardHeight);
  const cardCtx = cardCanvas.getContext('2d');
  if (!cardCtx) {
    throw new Error('Could not initialize card canvas.');
  }

  cardCtx.save();
  roundedRect(cardCtx, 0, 0, cardWidth, cardHeight, 22 * safeScale);
  cardCtx.clip();
  drawPaperTexture(cardCtx, cardWidth, cardHeight);

  const photoCanvas = drawPhoto(image, settings, photoSize, applyEffects);
  const photoX = sideBorder;
  const photoY = topBorder;
  cardCtx.save();
  roundedRect(cardCtx, photoX, photoY, photoSize, photoSize, 10 * safeScale);
  cardCtx.clip();
  cardCtx.drawImage(photoCanvas, photoX, photoY);
  cardCtx.restore();

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
    cardCtx.fillStyle = 'rgba(54, 45, 35, 0.88)';
    cardCtx.font = `${Math.round(
      settings.captionFontSize * safeScale
    )}px ${getCaptionFontFamily(settings.captionFont)}`;
    cardCtx.textAlign = 'center';
    cardCtx.textBaseline = 'middle';
    cardCtx.fillText(
      settings.captionText,
      cardWidth / 2,
      baseline,
      cardWidth * 0.82
    );
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

export async function exportCanvasBlob(
  image: HTMLImageElement,
  settings: PolaroidSettings,
  format: 'png' | 'jpg',
  exportSettings: ExportSettings
) {
  const exportCanvas = createCanvas(1, 1);
  renderPolaroid(exportCanvas, image, settings, {
    scale: exportSettings.scale,
    applyEffects: true,
  });

  const jpegQuality = clamp(exportSettings.quality, 50, 100) / 100;

  if (format === 'jpg') {
    const flattenedCanvas = createCanvas(exportCanvas.width, exportCanvas.height);
    const flattenedCtx = flattenedCanvas.getContext('2d');

    if (!flattenedCtx) {
      throw new Error('Could not initialize export canvas.');
    }

    flattenedCtx.fillStyle = '#f2e9dd';
    flattenedCtx.fillRect(0, 0, flattenedCanvas.width, flattenedCanvas.height);
    flattenedCtx.drawImage(exportCanvas, 0, 0);

    return new Promise<Blob>((resolve, reject) => {
      flattenedCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to render export blob.'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        jpegQuality
      );
    });
  }

  return new Promise<Blob>((resolve, reject) => {
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to render export blob.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}
