import { DHashLRUCache, type RawDetectionOutput } from '@ghadhul-bashar/core';

interface UrlCacheRecord {
  key: string;
  dhash: string;
  raw: RawDetectionOutput;
  updatedAt: number;
}

const DB_NAME = 'gb_vision_cache_v1';
const STORE_NAME = 'raw_verdicts';
const MAX_URL_ENTRIES = 1500;
const MAX_IDB_ENTRIES = 6000;

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class TwoTierVisionCache {
  private readonly urlMap = new Map<string, UrlCacheRecord>();
  private readonly dhashLru = new DHashLRUCache<RawDetectionOutput>(MAX_URL_ENTRIES);
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
              store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  async getByUrlKey(key: string): Promise<RawDetectionOutput | undefined> {
    const mem = this.urlMap.get(key);
    if (mem) {
      this.urlMap.delete(key);
      this.urlMap.set(key, mem);
      return mem.raw;
    }

    const db = await this.getDb();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          const rec = req.result as UrlCacheRecord | undefined;
          if (rec?.raw) {
            this.putMemory(rec);
            resolve(rec.raw);
          } else {
            resolve(undefined);
          }
        };
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  getByDHash(dhash: string): RawDetectionOutput | undefined {
    return this.dhashLru.findSimilar(dhash, 2);
  }

  private putMemory(record: UrlCacheRecord): void {
    if (this.urlMap.has(record.key)) {
      this.urlMap.delete(record.key);
    } else if (this.urlMap.size >= MAX_URL_ENTRIES) {
      const oldest = this.urlMap.keys().next().value;
      if (oldest !== undefined) this.urlMap.delete(oldest);
    }
    this.urlMap.set(record.key, record);
    if (record.dhash) {
      this.dhashLru.set(record.dhash, record.raw);
    }
  }

  async put(key: string, dhash: string, raw: RawDetectionOutput): Promise<void> {
    const record: UrlCacheRecord = {
      key,
      dhash,
      raw,
      updatedAt: Date.now(),
    };
    this.putMemory(record);

    const db = await this.getDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);

      // Periodic lightweight LRU eviction in IDB
      if (Math.random() < 0.03) {
        const countReq = store.count();
        countReq.onsuccess = () => {
          if (countReq.result > MAX_IDB_ENTRIES) {
            const excess = countReq.result - MAX_IDB_ENTRIES;
            const idx = store.index('updatedAt');
            let deleted = 0;
            idx.openCursor().onsuccess = (ev) => {
              const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
              if (cursor && deleted < excess) {
                cursor.delete();
                deleted++;
                cursor.continue();
              }
            };
          }
        };
      }
    } catch {
      // Non-fatal cache write error
    }
  }
}
