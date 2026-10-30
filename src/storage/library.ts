/** Bibliothèque des fichiers MIDI importés, conservée dans le navigateur (IndexedDB). */

export interface StoredSong {
  id: string;
  name: string;
  addedAt: number;
  data: ArrayBuffer;
  /** Index des pistes choisies la dernière fois. */
  selectedTracks?: number[];
}

const DB_NAME = 'playano';
const STORE = 'songs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listSongs(): Promise<StoredSong[]> {
  const songs = await withStore<StoredSong[]>('readonly', (store) => store.getAll());
  return songs.sort((a, b) => b.addedAt - a.addedAt);
}

export function getSong(id: string): Promise<StoredSong | undefined> {
  return withStore<StoredSong | undefined>('readonly', (store) => store.get(id));
}

export async function saveSong(song: StoredSong): Promise<void> {
  await withStore('readwrite', (store) => store.put(song));
}

export async function deleteSong(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}
