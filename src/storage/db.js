// On-device storage: IndexedDB when available, otherwise an in-memory store
// so that the app keeps working (without saving) when storage is blocked,
// full, or unsupported. Nothing ever leaves the device.

export const DB_NAME = 'patha';
export const DB_VERSION = 1;
/** Object stores and their key paths. */
export const STORES = /** @type {const} */ ({ texts: 'id', progress: 'textId', settings: 'key' });

/** @typedef {keyof typeof STORES} StoreName */

/**
 * @typedef {Object} Storage
 * @property {'indexeddb'|'memory'} kind
 * @property {boolean} persistent  whether data survives closing the page
 * @property {(store: StoreName) => Promise<any[]>} getAll
 * @property {(store: StoreName, value: any) => Promise<void>} put
 * @property {(store: StoreName, key: string) => Promise<void>} delete
 * @property {(data: Record<StoreName, any[]>) => Promise<void>} replaceAll  atomic: all or nothing
 * @property {() => void} close
 */

/**
 * Open storage, falling back to memory if IndexedDB is missing, throws,
 * errors, is blocked, or does not answer in time.
 * @param {{ indexedDB?: IDBFactory|null, name?: string, timeoutMs?: number }} [options]
 * @returns {Promise<Storage & { fallbackReason?: string }>}
 */
export async function openStorage({ indexedDB = globalThis.indexedDB, name = DB_NAME, timeoutMs = 5000 } = {}) {
  if (!indexedDB) return Object.assign(memoryStorage(), { fallbackReason: 'IndexedDB is not available' });
  try {
    const db = await openDatabase(indexedDB, name, timeoutMs);
    return idbStorage(db);
  } catch (err) {
    return Object.assign(memoryStorage(), {
      fallbackReason: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @param {IDBFactory} factory
 * @param {string} name
 * @param {number} timeoutMs
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase(factory, name, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB did not respond'));
    }, timeoutMs);
    /** @param {() => void} fn */
    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    /** @type {IDBOpenDBRequest} */
    let request;
    try {
      request = factory.open(name, DB_VERSION);
    } catch (err) {
      settle(() => reject(err));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [store, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      // Another tab upgrading the schema: step aside so it can proceed.
      db.onversionchange = () => db.close();
      settle(() => resolve(db));
    };
    request.onerror = () => settle(() => reject(request.error || new Error('IndexedDB failed to open')));
    request.onblocked = () => settle(() => reject(new Error('IndexedDB is blocked by another tab')));
  });
}

/**
 * @param {IDBRequest|IDBTransaction} target
 * @param {'request'|'transaction'} type
 */
function done(target, type) {
  return new Promise((resolve, reject) => {
    if (type === 'request') {
      const r = /** @type {IDBRequest} */ (target);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    } else {
      const t = /** @type {IDBTransaction} */ (target);
      t.oncomplete = () => resolve(undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    }
  });
}

/**
 * @param {IDBDatabase} db
 * @returns {Storage}
 */
function idbStorage(db) {
  return {
    kind: 'indexeddb',
    persistent: true,
    async getAll(store) {
      const tx = db.transaction(store, 'readonly');
      return /** @type {Promise<any[]>} */ (done(tx.objectStore(store).getAll(), 'request'));
    },
    async put(store, value) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      await done(tx, 'transaction');
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      await done(tx, 'transaction');
    },
    async replaceAll(data) {
      const names = /** @type {StoreName[]} */ (Object.keys(STORES));
      const tx = db.transaction(names, 'readwrite');
      for (const name of names) {
        const os = tx.objectStore(name);
        os.clear();
        for (const value of data[name] ?? []) os.put(value);
      }
      await done(tx, 'transaction');
    },
    close() {
      db.close();
    },
  };
}

/** @param {any} v */
function clone(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

/**
 * In-memory storage with the same interface. Values are copied in and out,
 * like IndexedDB, so callers cannot accidentally share mutable state.
 * @returns {Storage}
 */
export function memoryStorage() {
  /** @type {Record<string, Map<string, any>>} */
  const maps = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
  /** @param {StoreName} store @param {any} value */
  const keyOf = (store, value) => String(value[STORES[store]]);
  return {
    kind: 'memory',
    persistent: false,
    async getAll(store) {
      return [...maps[store].values()].map(clone);
    },
    async put(store, value) {
      maps[store].set(keyOf(store, value), clone(value));
    },
    async delete(store, key) {
      maps[store].delete(String(key));
    },
    async replaceAll(data) {
      const next = Object.fromEntries(
        Object.keys(STORES).map((s) => {
          const store = /** @type {StoreName} */ (s);
          return [s, new Map((data[store] ?? []).map((v) => [keyOf(store, v), clone(v)]))];
        }),
      );
      Object.assign(maps, next);
    },
    close() {},
  };
}
