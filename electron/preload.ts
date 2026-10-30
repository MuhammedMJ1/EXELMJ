import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer gets. Keep it small and typed
// (mirrored in src/types.d.ts).
const api = {
  getSettings: (): Promise<{
    language: 'en' | 'ar'
    recentFiles: string[]
    systemFonts?: string[]
    hindiDigits?: boolean
  }> => ipcRenderer.invoke('settings:get'),
  setLanguage: (lang: 'en' | 'ar'): Promise<void> => ipcRenderer.invoke('settings:set-language', lang),
  saveFonts: (fonts: string[]): void => ipcRenderer.send('settings:set-fonts', fonts),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  setDirty: (dirty: boolean): void => ipcRenderer.send('doc:set-dirty', dirty),
  requestClose: (): void => ipcRenderer.send('doc:request-close'),

  openFile: (): Promise<{ path: string; bytes: Uint8Array } | null> => ipcRenderer.invoke('file:open'),
  readFile: (path: string): Promise<{ path: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke('file:read', path),
  getPendingOpenFile: (): Promise<string | null> => ipcRenderer.invoke('file:pending-open'),
  saveFile: (path: string, bytes: Uint8Array): Promise<boolean> => ipcRenderer.invoke('file:save', path, bytes),
  saveFileAs: (
    bytes: Uint8Array,
    suggestedName?: string,
    kind?: 'xlsx' | 'docx' | 'pdf' | 'png' | 'svg' | 'data'
  ): Promise<string | null> => ipcRenderer.invoke('file:save-as', bytes, suggestedName, kind),
  /**
   * MCP tool calls arrive from main and are answered on a ONE-SHOT channel
   * keyed by the call id — several calls can be in flight at once, and a
   * shared reply channel would let one answer resolve another's promise.
   */
  onStudioToolCall: (
    handler: (call: { callId: string; name: string; args: Record<string, unknown> }) => void
  ): void => {
    ipcRenderer.on('studio:tool-call', (_e, call) => handler(call))
  },
  replyStudioTool: (callId: string, result: unknown): void => {
    ipcRenderer.send(`studio:tool-result:${callId}`, result)
  },
  // --- the embedded mini-browser ---
  studioBrowserShow: (bounds: unknown) => ipcRenderer.invoke('studio:browser-show', bounds),
  studioBrowserBounds: (bounds: unknown) => ipcRenderer.invoke('studio:browser-bounds', bounds),
  studioBrowserHide: () => ipcRenderer.invoke('studio:browser-hide'),
  studioBrowserOpen: (url: string) => ipcRenderer.invoke('studio:browser-open', url),
  studioBrowserDevice: (device: string, opts?: unknown) =>
    ipcRenderer.invoke('studio:browser-device', device, opts),
  studioBrowserShot: (target?: string) => ipcRenderer.invoke('studio:browser-shot', target),
  studioBrowserDevices: () => ipcRenderer.invoke('studio:browser-devices'),
  studioServeProject: (dir: string) => ipcRenderer.invoke('studio:serve-project', dir),
  studioPickerArm: () => ipcRenderer.invoke('studio:picker-arm'),
  studioPickerDisarm: () => ipcRenderer.invoke('studio:picker-disarm'),
  onStudioPicked: (handler: (capture: Record<string, unknown>) => void): void => {
    ipcRenderer.on('studio:picked', (_e, capture) => handler(capture))
  },
  illustratorDetect: (): Promise<boolean> => ipcRenderer.invoke('illustrator:detect'),
  illustratorExtract: (aiPath: string): Promise<unknown> => ipcRenderer.invoke('illustrator:extract', aiPath),
  readFileSilent: (path: string): Promise<{ path: string; bytes: Uint8Array } | null> =>
    ipcRenderer.invoke('file:read-silent', path),
  writeFileSilent: (path: string, bytes: Uint8Array): Promise<boolean> =>
    ipcRenderer.invoke('file:write-silent', path, bytes),
  exportCsv: (bytes: Uint8Array, suggestedName?: string): Promise<string | null> =>
    ipcRenderer.invoke('file:export-csv', bytes, suggestedName),
  printSheet: (
    html: string,
    mode: 'print' | 'pdf',
    suggestedName?: string,
    opts?: {
      preferCSSPageSize?: boolean
      landscape?: boolean
      deviceName?: string
      bands?: {
        header?: string
        footer?: string
        pageNumbers?: boolean
        rtl?: boolean
        pageLabel?: string
      }
    }
  ): Promise<string | null> => ipcRenderer.invoke('print:html', html, mode, suggestedName, opts),
  listPrinters: (): Promise<Array<{ name: string; label: string }>> =>
    ipcRenderer.invoke('print:printers'),

  saveAutosave: (bytes: Uint8Array, meta: string, kind?: 'sheet' | 'word'): void =>
    ipcRenderer.send('autosave:save', bytes, meta, kind ?? 'sheet'),
  getAutosave: (kind?: 'sheet' | 'word'): Promise<{ bytes: Uint8Array; meta: string } | null> =>
    ipcRenderer.invoke('autosave:get', kind ?? 'sheet'),
  clearAutosave: (kind?: 'sheet' | 'word'): void => ipcRenderer.send('autosave:clear', kind ?? 'sheet'),

  onMenu: (cb: (action: string, payload?: unknown) => void): void => {
    ipcRenderer.on('menu', (_e, action: string, payload?: unknown) => cb(action, payload))
  }
}

contextBridge.exposeInMainWorld('exelmj', api)
