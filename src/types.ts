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
  borderTop: number;
  borderSide: number;
  borderBottom: number;
  shadowIntensity: number;
  rotation: number;
  blur: number;
  captionText: string;
  captionFontSize: number;
  captionFont: string;
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
