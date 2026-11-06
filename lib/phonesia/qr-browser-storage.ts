import { QrOutbox } from "./qr-outbox.ts";
import type { QrStorage, SealedQr } from "./qr-outbox.ts";

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
      reject(new Error("Browser storage unavailable")); return;
    }
    const request = indexedDB.open("phonesia-qr-pending-v1", 1);
    let expired = false;
    const timeout = setTimeout(() => { expired = true; reject(new Error("Browser storage timeout")); }, 5000);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("pending", { keyPath: "id" });
      request.result.createObjectStore("keys");
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (expired) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timeout); reject(new Error("Browser storage unavailable")); };
  });
  database.catch(() => { database = undefined; });
  return database;
}

async function transaction<T>(store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(new Error("Browser storage transaction failed"));
  });
}

let localLock: Promise<unknown> = Promise.resolve();
const storage: QrStorage = {
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (navigator.locks) return navigator.locks.request("phonesia-qr-pending-v1", work);
    // Older browsers still serialize this tab; server identity locks prevent duplicates across tabs.
    const pending = localLock.then(work, work);
    localLock = pending.catch(() => undefined);
    return pending;
  },
  async key() {
    const existing = await transaction<CryptoKey | undefined>("keys", "readonly", (store) => store.get("aes"));
    if (existing) return existing;
    const candidate = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const db = await openDatabase();
    // Atomic check/insert also protects key creation on browsers without Web Locks.
    return new Promise<CryptoKey>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      const store = tx.objectStore("keys");
      const request = store.get("aes");
      let key = candidate;
      request.onsuccess = () => {
        if (request.result) key = request.result;
        else store.put(candidate, "aes");
      };
      tx.oncomplete = () => resolve(key);
      tx.onabort = tx.onerror = () => reject(new Error("Browser encryption key unavailable"));
    });
  },
  all: () => transaction<SealedQr[]>("pending", "readonly", (store) => store.getAll()),
  async put(entry) { await transaction("pending", "readwrite", (store) => store.put(entry)); },
  async remove(id) { await transaction("pending", "readwrite", (store) => store.delete(id)); },
};

let outbox: QrOutbox | undefined;
export function browserQrOutbox() {
  outbox ||= new QrOutbox(storage);
  return outbox;
}
