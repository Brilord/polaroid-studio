import { ImageAsset } from '../types';

const ACCEPTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export async function fileToImageAsset(file: File): Promise<ImageAsset> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Unsupported file type. Use PNG, JPG, JPEG, or WEBP.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    name: file.name,
    dataUrl,
  };
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the selected image.'));
    image.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsDataURL(file);
  });
}
