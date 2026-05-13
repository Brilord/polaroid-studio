import { ExportFormat, ExportSettings, ImageAsset, PolaroidSettings } from '../types';

type PendingExport = {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
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

const pendingExports = new Map<number, PendingExport>();
let exportWorker: Worker | null = null;
let nextExportId = 1;

function canUseExportWorker() {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}

function getExportWorker() {
  if (!canUseExportWorker()) {
    throw new Error('Offscreen export workers are not available.');
  }

  if (!exportWorker) {
    exportWorker = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), {
      type: 'module',
    });
    exportWorker.addEventListener('message', (event: MessageEvent<ExportWorkerResponse>) => {
      const response = event.data;
      const pending = pendingExports.get(response.id);
      if (!pending) {
        return;
      }

      pendingExports.delete(response.id);
      if (response.ok) {
        pending.resolve(new Blob([response.buffer], { type: response.mimeType }));
      } else {
        pending.reject(new Error(response.error));
      }
    });
    exportWorker.addEventListener('error', (event) => {
      pendingExports.forEach(({ reject }) => {
        reject(new Error(event.message || 'Export worker failed.'));
      });
      pendingExports.clear();
      exportWorker?.terminate();
      exportWorker = null;
    });
  }

  return exportWorker;
}

export function renderExportBlobInWorker(
  asset: ImageAsset,
  settings: PolaroidSettings,
  format: ExportFormat,
  exportSettings: ExportSettings,
  seed: string
) {
  const worker = getExportWorker();
  const id = nextExportId;
  nextExportId += 1;

  return new Promise<Blob>((resolve, reject) => {
    pendingExports.set(id, { resolve, reject });
    worker.postMessage({
      id,
      asset,
      settings,
      format,
      exportSettings,
      seed,
    });
  });
}

export function disposeExportWorker() {
  exportWorker?.terminate();
  exportWorker = null;
  pendingExports.clear();
}
