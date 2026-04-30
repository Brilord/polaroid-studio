export function bytesToBlob(
  data: number[],
  mimeType = 'application/octet-stream'
) {
  return new Blob([new Uint8Array(data)], { type: mimeType });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTextFile(text: string, filename: string) {
  downloadBlob(new Blob([text], { type: 'application/json' }), filename);
}

export function selectTextFile(accept = 'application/json,.json') {
  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.className = 'hidden';

    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        input.remove();

        if (!file) {
          resolve(null);
          return;
        }

        file
          .text()
          .then(resolve)
          .catch(() => reject(new Error('Failed to read the selected file.')));
      },
      { once: true }
    );

    document.body.append(input);
    input.click();
  });
}

export async function copyBlobToClipboard(blob: Blob) {
  const ClipboardItemConstructor = window.ClipboardItem;
  if (!navigator.clipboard || !ClipboardItemConstructor) {
    throw new Error('Clipboard image copy is not available in this browser.');
  }

  await navigator.clipboard.write([
    new ClipboardItemConstructor({
      [blob.type]: blob,
    }),
  ]);
}
