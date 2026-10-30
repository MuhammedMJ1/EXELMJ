// Opening and saving files in the web edition (phones first).
//
// Three ways a file can come in or go out, best first:
//   1. File System Access (Chrome 132+ on Android): the picker hands back a
//      handle, so Save writes back into the very file that was opened.
//   2. A plain <input type=file> to open; download or the share sheet to
//      save a copy out (WhatsApp, Drive, e-mail…).
//   3. Nothing leaves the phone at all: every open and save also keeps a copy
//      inside the app (IndexedDB, see webStore), so Save can never lose work
//      even where 1 is missing.
// The pure helpers at the top carry no DOM and are unit-tested.

export type DocKind = 'sheet' | 'csv' | 'doc' | 'pdf' | 'other'

const TYPES: Record<string, { mime: string; kind: DocKind }> = {
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'sheet' },
  xlsm: { mime: 'application/vnd.ms-excel.sheet.macroEnabled.12', kind: 'sheet' },
  csv: { mime: 'text/csv', kind: 'csv' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'doc' },
  pdf: { mime: 'application/pdf', kind: 'pdf' },
  png: { mime: 'image/png', kind: 'other' },
  svg: { mime: 'image/svg+xml', kind: 'other' },
  json: { mime: 'application/json', kind: 'other' }
}

/** What the web edition opens from the phone. */
export const OPEN_EXTENSIONS = ['.xlsx', '.xlsm', '.csv', '.docx']

/** MIME type and kind of an office file, by its name. */
export function docFileType(name: string): { ext: string; mime: string; kind: DocKind } {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim())
  const ext = m ? m[1].toLowerCase() : ''
  const known = TYPES[ext]
  return { ext, mime: known?.mime ?? 'application/octet-stream', kind: known?.kind ?? 'other' }
}

/** The extension the bridge's `kind` stands for (desktop ipc.ts defaults to xlsx). */
export function extensionForKind(kind?: string): string {
  if (kind === 'docx' || kind === 'pdf' || kind === 'png' || kind === 'svg') return kind
  if (kind === 'data') return ''
  return 'xlsx'
}

/**
 * A name safe to hand to a download or a picker: no folder separators or
 * characters Android and Windows refuse, never empty, and ending in `ext`
 * unless it already carries an extension that belongs to the same kind.
 */
export function safeFileName(name: string | undefined, ext: string, fallback: string): string {
  const cleaned = (name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim()
  const base = cleaned || fallback
  if (!ext) return base
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base.replace(/\.(xlsx|xlsm|csv|docx|pdf)$/i, '')}.${ext}`
}

/**
 * Paths the web bridge hands to the app look like `web:<id>/<name>`: the app's
 * own basename() reads the name off the end, and the id finds the file's copy
 * (and handle) in the store.
 */
export function makeWebPath(id: string, name: string): string {
  return `web:${id}/${name}`
}

export function parseWebPath(path: string): { id: string; name: string } | null {
  const m = /^web:([^/]+)\/(.+)$/.exec(path)
  return m ? { id: m[1], name: m[2] } : null
}

export type RecentEntry = { id: string; name: string; at: number }

/**
 * The recent list after `entry` was opened or saved: newest first, one entry
 * per file name (reopening a file moves it up rather than duplicating it), at
 * most `max` long. Returns the list and the ids that fell off the end.
 */
export function upsertRecent<T extends RecentEntry>(
  list: readonly T[],
  entry: T,
  max: number
): { list: T[]; dropped: string[] } {
  const rest = list.filter((r) => r.id !== entry.id && r.name !== entry.name)
  const replaced = list.filter((r) => r.id !== entry.id && r.name === entry.name).map((r) => r.id)
  const next = [entry, ...rest].sort((a, b) => b.at - a.at)
  return { list: next.slice(0, max), dropped: [...replaced, ...next.slice(max).map((r) => r.id)] }
}

// --- the DOM side ------------------------------------------------------------

/** The File System Access methods Chrome ships but TypeScript's DOM lib lacks. */
type PermissionHandle = FileSystemFileHandle & {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}
type PickerWindow = Window & {
  showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>
}

const isAbort = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError'

function pickerTypes(extensions: string[]) {
  const accept: Record<string, string[]> = {}
  for (const ext of extensions) {
    const { mime } = docFileType(`x${ext}`)
    ;(accept[mime] ??= []).push(ext)
  }
  return [{ description: 'EXELMJ', accept }]
}

export type PickedFile = { name: string; bytes: Uint8Array; handle?: FileSystemFileHandle }

/** Let the user choose a file on the phone. Null when they back out. */
export async function pickFile(extensions: string[] = OPEN_EXTENSIONS): Promise<PickedFile | null> {
  const w = window as PickerWindow
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ multiple: false, types: pickerTypes(extensions) })
      if (!handle) return null
      const file = await handle.getFile()
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle }
    } catch (err) {
      if (isAbort(err)) return null
      // A picker that exists but fails (older Android builds): use the input.
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = extensions.join(',')
    input.style.display = 'none'
    let settled = false
    const done = (v: PickedFile | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(v)
    }
    input.addEventListener('change', async () => {
      const f = input.files?.[0]
      if (!f) return done(null)
      done({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
    })
    input.addEventListener('cancel', () => done(null))
    document.body.append(input)
    input.click()
  })
}

/** Write into a file the user opened or picked. False when the phone refuses. */
export async function writeToHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<boolean> {
  const h = handle as PermissionHandle
  try {
    if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if (!h.requestPermission || (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return false
    }
    const writable = await handle.createWritable()
    await writable.write(bytes as unknown as BufferSource)
    await writable.close()
    return true
  } catch (err) {
    console.warn('[web] write to file failed', err)
    return false
  }
}

export function downloadBytes(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: docFileType(name).mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function canShareFiles(): boolean {
  try {
    const probe = new File([''], 'x.xlsx', { type: TYPES.xlsx.mime })
    return !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

/** Hand the file to the phone's share sheet. */
export async function shareBytes(bytes: Uint8Array, name: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const file = new File([bytes as unknown as BlobPart], name, { type: docFileType(name).mime })
    if (!navigator.canShare?.({ files: [file] })) return 'failed'
    await navigator.share({ files: [file], title: name })
    return 'shared'
  } catch (err) {
    return isAbort(err) ? 'cancelled' : 'failed'
  }
}

export type SavedCopy = { name: string; how: 'file' | 'download' | 'share'; handle?: FileSystemFileHandle }

/**
 * Save-as: a real file through the save picker where the phone has one, else
 * the user's choice of download or share (asked by `choose`). Null when the
 * user backs out.
 */
export async function saveBytesAs(
  bytes: Uint8Array,
  name: string,
  choose: () => Promise<'download' | 'share' | null>
): Promise<SavedCopy | null> {
  const w = window as PickerWindow
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: name, types: pickerTypes([`.${docFileType(name).ext}`]) })
      if (await writeToHandle(handle, bytes)) return { name: handle.name, how: 'file', handle }
    } catch (err) {
      if (isAbort(err)) return null
      // A save picker that exists but fails: fall back to download / share.
    }
  }
  const how = await choose()
  if (!how) return null
  if (how === 'share') {
    const shared = await shareBytes(bytes, name)
    if (shared === 'shared') return { name, how: 'share' }
    if (shared === 'cancelled') return null
  }
  downloadBytes(bytes, name)
  return { name, how: 'download' }
}
