import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { MAX_BYTES, ScenarioRepository, type TextDriver } from '@immobil/storage';

interface DesktopBridge {
  read(slot: 'archive' | 'backup'): Promise<string | null>;
  write(slot: 'archive' | 'backup', contents: string): Promise<void>;
  exportFile(contents: string): Promise<void>;
  applicationReady(): void;
  onBeforeClose(callback: () => Promise<boolean>): () => void;
}
declare global { interface Window { immobilDesktop?: DesktopBridge } }

function indexedDbDriver(): TextDriver {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('immobiliare-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('DATABASE_BLOCKED'));
  });
  return {
    async read(slot) {
      const connection = await db;
      return new Promise((resolve, reject) => {
        const transaction = connection.transaction('files', 'readonly');
        const request = transaction.objectStore('files').get(slot);
        transaction.oncomplete = () => resolve(request.result ?? null);
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    },
    async write(slot, contents) {
      const connection = await db;
      return new Promise((resolve, reject) => {
        const transaction = connection.transaction('files', 'readwrite');
        transaction.objectStore('files').put(contents, slot);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    },
  };
}

function androidDriver(): TextDriver {
  return {
    async read(slot) {
      const path = `immobiliare/${slot}.json`;
      // Solo l'assenza effettiva del file viene interpretata come archivio vuoto.
      const listing = await Filesystem.readdir({ path: '', directory: Directory.Data });
      if (!listing.files.some(f => f.name === 'immobiliare')) return null;
      const contents = await Filesystem.readdir({ path: 'immobiliare', directory: Directory.Data });
      if (!contents.files.some(f => f.name === `${slot}.json`)) return null;
      const file = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
      if (typeof file.data !== 'string') throw new Error('INVALID_FILE');
      return file.data;
    },
    async write(slot, contents) {
      const path = `immobiliare/${slot}.json`, temporary = `${path}.tmp`;
      await Filesystem.writeFile({ path: temporary, data: contents, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
      // La sostituzione non è presunta atomica su Android: il repository conserva
      // sempre un'altra copia valida prima di sostituire l'archivio principale.
      const listing = await Filesystem.readdir({ path: 'immobiliare', directory: Directory.Data });
      if (listing.files.some(f => f.name === `${slot}.json`)) await Filesystem.deleteFile({ path, directory: Directory.Data });
      await Filesystem.rename({ from: temporary, to: path, directory: Directory.Data, toDirectory: Directory.Data });
    },
  };
}
const driver = window.immobilDesktop ?? (Capacitor.isNativePlatform() ? androidDriver() : indexedDbDriver());
export const repository = new ScenarioRepository(driver);

export async function exportFile(contents: string): Promise<void> {
  if (window.immobilDesktop) return window.immobilDesktop.exportFile(contents);
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({ path: 'immobiliare-backup.json', data: contents, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Immobiliare', url: file.uri });
    return;
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  link.href = url; link.download = 'immobiliare-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function pickAndroidFile(): Promise<string | null> {
  const result = await FilePicker.pickFiles({ types: ['application/json'], readData: false, limit: 1 });
  const file = result.files[0];
  if (!file) return null;
  if (file.size > MAX_BYTES || !file.path) throw new Error('INVALID_FILE');
  const contents = await Filesystem.readFile({ path: file.path, encoding: Encoding.UTF8 });
  if (typeof contents.data !== 'string' || new TextEncoder().encode(contents.data).byteLength > MAX_BYTES) throw new Error('INVALID_FILE');
  return contents.data;
}
