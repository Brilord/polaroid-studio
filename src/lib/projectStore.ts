import { ImageAsset } from '../types';

const DATABASE_NAME = 'polaroid-studio';
const DATABASE_VERSION = 1;
const IMAGE_STORE = 'images';

export type StoredImageRef = {
  id: string;
  name: string;
  path?: string;
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getImageAssetId(asset: ImageAsset) {
  return `${hashString(`${asset.name}:${asset.path ?? ''}:${asset.dataUrl.length}:${asset.dataUrl.slice(0, 256)}`)}-${asset.dataUrl.length}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage.'));
  });
}

function runStoreRequest<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>
) {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(IMAGE_STORE, mode);
        const store = transaction.objectStore(IMAGE_STORE);
        const request = execute(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error('Project storage request failed.'));
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('Project storage transaction failed.'));
        };
      })
  );
}

export async function saveImageAsset(asset: ImageAsset): Promise<StoredImageRef> {
  const id = getImageAssetId(asset);
  await runStoreRequest('readwrite', (store) =>
    store.put({
      ...asset,
      id,
      updatedAt: Date.now(),
    })
  );

  return {
    id,
    name: asset.name,
    path: asset.path,
  };
}

export function loadImageAsset(
  ref: StoredImageRef | null | undefined
): Promise<ImageAsset | null> {
  if (!ref) {
    return Promise.resolve(null);
  }

  return runStoreRequest<ImageAsset & { id: string } | undefined>('readonly', (store) =>
    store.get(ref.id)
  ).then((record) => {
    if (!record) {
      return null;
    }

    return {
      name: record.name,
      dataUrl: record.dataUrl,
      path: record.path,
    } satisfies ImageAsset;
  });
}

export function loadImageAssets(refs: StoredImageRef[]): Promise<ImageAsset[]> {
  return Promise.all(refs.map((ref) => loadImageAsset(ref))).then((assets) =>
    assets.filter((asset): asset is ImageAsset => asset !== null)
  );
}
