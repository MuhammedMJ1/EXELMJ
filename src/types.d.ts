// Typing for the preload bridge (see electron/preload.ts).
// The bridge is absent when the renderer runs in a plain browser (dev preview).
interface ExelmjBridge {
  getSettings(): Promise<{
    language: 'en' | 'ar'
    recentFiles: string[]
    systemFonts?: string[]
    hindiDigits?: boolean
  }>
  setLanguage(lang: 'en' | 'ar'): Promise<void>
  saveFonts(fonts: string[]): void
  printSheet(
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
  ): Promise<string | null>
  getVersion(): Promise<string>
  setDirty(dirty: boolean): void
  requestClose(): void
  openFile(): Promise<{ path: string; bytes: Uint8Array } | null>
  readFile(path: string): Promise<{ path: string; bytes: Uint8Array } | null>
  getPendingOpenFile(): Promise<string | null>
  saveFile(path: string, bytes: Uint8Array): Promise<boolean>
  saveFileAs(
    bytes: Uint8Array,
    suggestedName?: string,
    kind?: 'xlsx' | 'docx' | 'pdf' | 'png' | 'svg' | 'data'
  ): Promise<string | null>
  onStudioToolCall(
    handler: (call: { callId: string; name: string; args: Record<string, unknown> }) => void
  ): void
  replyStudioTool(callId: string, result: unknown): void
  studioBrowserShow(bounds: { x: number; y: number; width: number; height: number }): Promise<{ ok: boolean; reason?: string }>
  studioBrowserBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<{ ok: boolean }>
  studioBrowserHide(): Promise<{ ok: boolean }>
  studioBrowserOpen(url: string): Promise<{ ok: boolean; reason?: string }>
  studioBrowserDevice(
    device: string,
    opts?: { rotate?: boolean; colorScheme?: 'light' | 'dark'; reducedMotion?: boolean }
  ): Promise<{ ok: boolean; reason?: string }>
  studioBrowserShot(target?: string): Promise<{ ok: boolean; path?: string; reason?: string }>
  studioBrowserDevices(): Promise<Array<{ id: string; label: string; kind: string; w: number; h: number; dpr: number }>>
  studioServeProject(dir: string): Promise<{ ok: boolean; url?: string; projectId?: string; reason?: string }>
  studioPickerArm(): Promise<{ ok: boolean; reason?: string }>
  studioPickerDisarm(): Promise<{ ok: boolean }>
  onStudioPicked(handler: (capture: Record<string, unknown>) => void): void
  illustratorDetect(): Promise<boolean>
  illustratorExtract(aiPath: string): Promise<{
    ok: boolean
    runs: Array<{
      text: string
      x: number
      y: number
      width: number
      height: number
      size: number
      color: string
      font: string
      dir: 'rtl' | 'ltr'
    }>
    unreachable?: Record<string, number>
    artboards?: number
    error?: string
  }>
  readFileSilent(path: string): Promise<{ path: string; bytes: Uint8Array } | null>
  writeFileSilent(path: string, bytes: Uint8Array): Promise<boolean>
  exportCsv(bytes: Uint8Array, suggestedName?: string): Promise<string | null>
  listPrinters?(): Promise<Array<{ name: string; label: string }>>
  saveAutosave(bytes: Uint8Array, meta: string, kind?: 'sheet' | 'word'): void
  getAutosave(kind?: 'sheet' | 'word'): Promise<{ bytes: Uint8Array; meta: string } | null>
  clearAutosave(kind?: 'sheet' | 'word'): void
  onMenu(cb: (action: string, payload?: unknown) => void): void
}

interface Window {
  exelmj?: ExelmjBridge
}
