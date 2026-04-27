export type ImageAsset = {
  name: string;
  dataUrl: string;
  path?: string;
};

export type PolaroidSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  fade: number;
  grain: number;
  vignette: number;
  cropZoom: number;
  cropX: number;
  cropY: number;
  cropRotation: number;
  flipX: boolean;
  flipY: boolean;
  borderTop: number;
  borderSide: number;
  borderBottom: number;
  shadowIntensity: number;
  rotation: number;
  blur: number;
  captionText: string;
  captionFontSize: number;
  captionFont: string;
  captionColor: string;
  captionAlign: 'left' | 'center' | 'right';
  frameTheme: 'white' | 'cream' | 'black' | 'aged' | 'pink' | 'blue' | 'green';
  overlay: 'none' | 'tape' | 'dust' | 'scratches' | 'fingerprints' | 'lightleak';
  watermarkText: string;
  watermarkOpacity: number;
};

export type PolaroidPreset = {
  id: string;
  name: string;
  description: string;
  settings: Partial<PolaroidSettings>;
};

export type ExportFormat = 'png' | 'jpg';

export type ExportSettings = {
  scale: number;
  quality: number;
};

export type PolaroidProject = {
  image: ImageAsset | null;
  settings: PolaroidSettings;
  activePresetId: string;
  updatedAt: number;
};
