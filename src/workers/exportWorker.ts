import { exportCanvasBlob } from '../lib/polaroidRenderer';
import { ExportFormat, ExportSettings, ImageAsset, PolaroidSettings } from '../types';

type ExportWorkerRequest = {
  id: number;
  asset: ImageAsset;
  settings: PolaroidSettings;
  format: ExportFormat;
  exportSettings: ExportSettings;
  seed: string;
};

type ExportWorkerResponse =
  | {
      id: number;
      ok: true;
      buffer: ArrayBuffer;
      mimeType: string;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

async function loadBitmap(dataUrl: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

self.addEventListener('message', (event: MessageEvent<ExportWorkerRequest>) => {
  const { id, asset, settings, format, exportSettings, seed } = event.data;

  void (async () => {
    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await loadBitmap(asset.dataUrl);
      const blob = await exportCanvasBlob(
        bitmap,
        settings,
        format,
        exportSettings,
        seed
      );
      const buffer = await blob.arrayBuffer();
      const response: ExportWorkerResponse = {
        id,
        ok: true,
        buffer,
        mimeType: blob.type,
      };
      self.postMessage(response, { transfer: [buffer] });
    } catch (error) {
      const response: ExportWorkerResponse = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : 'Worker export failed.',
      };
      self.postMessage(response);
    } finally {
      bitmap?.close();
    }
  })();
});
