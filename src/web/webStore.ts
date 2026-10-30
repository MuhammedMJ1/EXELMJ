// Storage for the web edition.
//
// Settings live in localStorage: tiny, and read synchronously at boot before
// anything is drawn. File bytes — the crash-recovery copies and the recently
// opened files — live in IndexedDB, which holds binary data (and File System
// Access handles) and survives the browser being closed or Android killing
// the app in the background.
import { upsertRecent, type RecentEntry } from './webFiles'

export type WebLang = 'en' | 'ar'
export type WebSettings = { language: WebLang; hindiDigits: boolean }

const SETTINGS_KEY = 'exelmj.web.settings'

/** First run: Arabic when the phone speaks any Arabic, English otherwise. */
function defaultLanguage(): WebLang {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some((l) => /^ar\b/i.test(l ?? '')) ? 'ar' : 'en'
}

export function loadSettings(): WebSettings {
  let saved: Partial<WebSettings> = {}
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<WebSettings>
  } catch {
    saved = {}
  }
  return {
    language: saved.language === 'ar' || saved.language === 'en' ? saved.language : defaultLanguage(),
    hindiDigits: !!saved.hindiDigits
  }
}

export function saveSettings(patch: Partial<WebSettings>) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...patch }))
  } catch {
    // private mode / storage full: the setting simply does not stick
  }
}

// --- IndexedDB ---------------------------------------------------------------

const DB_NAME = 'exelmj-web'
const DB_VERSION = 1
const KV = 'kv'
const RECENT = 'recent'
/** Recent files keep their bytes, so the list stays short. */
export const MAX_RECENT = 8

export type RecentFile = RecentEntry & { bytes: Uint8Array; handle?: FileSystemFileHandle }

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV)
        if (!d.objectStoreNames.contains(RECENT)) d.createObjectStore(RECENT, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // A failed open must not stay cached: the next call retries.
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode)
        const req = op(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
  )
}

export const webStore = {
  get<T>(key: string): Promise<T | undefined> {
    return run<T | undefined>(KV, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
  },
  set(key: string, value: unknown): Promise<void> {
    return run(KV, 'readwrite', (s) => s.put(value, key)).then(() => undefined)
  },
  delete(key: string): Promise<void> {
    return run(KV, 'readwrite', (s) => s.delete(key)).then(() => undefined)
  },

  async recentList(): Promise<RecentFile[]> {
    const all = await run<RecentFile[]>(RECENT, 'readonly', (s) => s.getAll() as IDBRequest<RecentFile[]>)
    return all.sort((a, b) => b.at - a.at)
  },
  recentGet(id: string): Promise<RecentFile | undefined> {
    return run<RecentFile | undefined>(RECENT, 'readonly', (s) => s.get(id) as IDBRequest<RecentFile | undefined>)
  },
  /** Store (or refresh) a file's copy and trim the list. */
  async recentPut(file: RecentFile): Promise<void> {
    const current = await this.recentList()
    const { dropped } = upsertRecent(current, file, MAX_RECENT)
    const d = await db()
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(RECENT, 'readwrite')
      const s = tx.objectStore(RECENT)
      s.put(file)
      for (const id of dropped) s.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }
}
