// util/offlineQueue.ts
// Tiny IndexedDB queue for note PUTs that fail because the network is gone.
// Notes are <2KB and the user only writes to one track at a time, so we keep
// at most one pending entry per track_id (latest write wins on enqueue) and
// drain FIFO on `online` / `visibilitychange` / page-load.
//
// Why a single-store dedupe-by-track approach: a 30-minute subway session of
// rapid edits to one track shouldn't replay 600 PUTs on resume. Server state
// for that track only ever needs the *last* version the user typed.

const DB_NAME = "songnotes";
const DB_VERSION = 1;
const STORE = "pending_writes";

export type PendingWrite = {
  track_id: string;
  note: string;
  expected_updated_at: string | null;
  name: string | null;
  artists: string[];
  artist_urls: string[];
  image_url: string;
  track_url: string;
  album_url: string;
  enqueued_at: number;
};

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!idbAvailable()) {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // track_id as the keypath gives us free dedupe: a second enqueue
        // for the same track overwrites the first.
        db.createObjectStore(STORE, { keyPath: "track_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
    req.onblocked = () => reject(new Error("idb_blocked"));
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await fn(tx.objectStore(STORE));
    return result;
  } finally {
    db.close();
  }
}

export async function enqueueWrite(
  w: Omit<PendingWrite, "enqueued_at">
): Promise<boolean> {
  try {
    await withStore("readwrite", async (s) => {
      await promisify(s.put({ ...w, enqueued_at: Date.now() }));
    });
    return true;
  } catch (err) {
    console.warn("[offlineQueue] enqueue failed:", err);
    return false;
  }
}

export async function listPending(): Promise<PendingWrite[]> {
  try {
    return await withStore("readonly", (s) =>
      promisify(s.getAll() as IDBRequest<PendingWrite[]>)
    );
  } catch {
    return [];
  }
}

export async function removeWrite(trackId: string): Promise<void> {
  try {
    await withStore("readwrite", async (s) => {
      await promisify(s.delete(trackId));
    });
  } catch (err) {
    console.warn("[offlineQueue] remove failed:", err);
  }
}

export async function pendingCount(): Promise<number> {
  try {
    return await withStore("readonly", (s) =>
      promisify(s.count() as IDBRequest<number>)
    );
  } catch {
    return 0;
  }
}
