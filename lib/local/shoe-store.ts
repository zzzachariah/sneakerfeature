// Tiny IndexedDB store for the on-device shoe catalog. The whole (public,
// read-only) catalog is kept as a single record — we read/search it in memory,
// so there's no need for per-shoe rows or indexes. All access is guarded and
// best-effort: any failure (private mode, quota, unsupported) resolves to null /
// no-op so callers fall back to the network.
import type { Shoe } from "@/lib/types";

const DB_NAME = "sf-local";
const DB_VERSION = 1;
const STORE = "catalog";
const KEY = "shoes";

export type LocalCatalog = { version: string; shoes: Shoe[] };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readCatalog(): Promise<LocalCatalog | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise<LocalCatalog | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as LocalCatalog | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function writeCatalog(catalog: LocalCatalog): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(catalog, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* quota / private mode — ignore, the network copy still works */
  }
}
