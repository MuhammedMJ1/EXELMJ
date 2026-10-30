// EXELMJ find-in-all-sheets.
//
// Univer's Ctrl+F opens a "Find in this Sheet" box. The whole-workbook scope
// exists but only inside the advanced (replace) dialog, so a plain search never
// looked past the sheet on screen — the manager expects one search to cover
// every sheet.
//
// 1. Every new find session is flipped to the workbook scope. (Replace keeps
//    Univer's current-sheet default: a Replace All across every sheet by
//    default is not what "search" asked for.)
// 2. A small strip inside the find dialog says how many sheets hold the text
//    and lists them — one chip per sheet with its match count, the sheet of the
//    current match highlighted. A click activates that sheet and lands on a
//    match there.
//
// Univer 0.25.1 is pinned exactly (package.json), so the strip reads the
// per-sheet matches from the search model's internals (`_model._findModels`) —
// the public service only exposes a total count. If those internals ever move,
// the strip simply stays hidden; searching itself is untouched.
import type { FUniver, Univer } from '@univerjs/presets'
import {
  FindScope,
  IFindReplaceService,
  type IFindReplaceState
} from '@univerjs/presets/preset-sheets-find-replace'
import { getLang, t } from '../i18n/i18n'

type MatchLike = {
  range?: { subUnitId?: string; range?: { startRow?: number; startColumn?: number } }
}

export type SheetHit = { sheetId: string; name: string; count: number; row: number; col: number }

/**
 * Matches grouped by sheet, in tab order, each with its count and the cell of
 * its first match. Matches on sheets not in `sheets` (hidden/deleted) drop out.
 */
export function groupMatchesBySheet(
  matches: readonly MatchLike[],
  sheets: readonly { id: string; name: string }[]
): SheetHit[] {
  const byId = new Map<string, SheetHit>()
  for (const m of matches) {
    const id = m.range?.subUnitId
    if (!id) continue
    const hit = byId.get(id)
    if (hit) {
      hit.count++
      continue
    }
    byId.set(id, {
      sheetId: id,
      name: '',
      count: 1,
      row: m.range?.range?.startRow ?? 0,
      col: m.range?.range?.startColumn ?? 0
    })
  }
  const out: SheetHit[] = []
  for (const s of sheets) {
    const hit = byId.get(s.id)
    if (hit) out.push({ ...hit, name: s.name })
  }
  return out
}

/** "Found in N sheets" — Arabic has its own singular, dual and 3-10 / 11+ forms. */
export function sheetCountPhrase(n: number): string {
  const key = n === 1 ? 'findSheetsOne' : n === 2 ? 'findSheetsTwo' : n <= 10 ? 'findSheetsFew' : 'findSheetsMany'
  return t(key).replace('{n}', String(n))
}

type FindModelLike = { getMatches(): MatchLike[] }
type ServiceInternals = { _model?: { _findModels?: FindModelLike[] } }

const STRIP_ID = 'exelmj-findsheets'
const STYLE_ID = 'exelmj-findsheets-style'
// Univer marks the dialog's body with this (find-replace 0.25.1, FindReplaceDialog).
const DIALOG_SELECTOR = '[data-u-comp="find-replace-dialog"]'

function injectCss() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${STRIP_ID}{margin-top:12px;font-size:12px;color:var(--univer-gray-500,#4e5565)}
    #${STRIP_ID} .fs-title{font-weight:600;margin-bottom:6px}
    #${STRIP_ID} .fs-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:88px;overflow-y:auto}
    #${STRIP_ID} .fs-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 10px;border:1px solid var(--univer-gray-200,#e3e5ea);border-radius:999px;background:var(--univer-gray-100,#eeeff1);color:var(--univer-gray-700,#272a2f);font:inherit;cursor:pointer}
    #${STRIP_ID} .fs-chip:hover{border-color:var(--univer-primary-500,#466af7)}
    #${STRIP_ID} .fs-chip[data-current="true"]{background:var(--univer-primary-50,#f3f5ff);border-color:var(--univer-primary-600,#2c53f1);color:var(--univer-primary-600,#2c53f1)}
    #${STRIP_ID} .fs-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}
    #${STRIP_ID} .fs-count{font-weight:600;font-variant-numeric:tabular-nums}
  `
  document.head.append(style)
}

let registered = false

function register(univer: Univer, univerAPI: FUniver): boolean {
  if (registered) return true
  try {
    const injector = (
      univer as unknown as { __getInjector(): { get(token: unknown): unknown } }
    ).__getInjector()
    const service = injector.get(IFindReplaceService) as IFindReplaceService

    injectCss()
    const strip = document.createElement('div')
    strip.id = STRIP_ID
    let lastState: IFindReplaceState | null = null
    let lastSignature = ''
    let frame = 0

    const computeHits = (): SheetHit[] => {
      const models = (service as unknown as ServiceInternals)._model?._findModels
      const wb = univerAPI.getActiveWorkbook()
      if (!models || !wb) return []
      const sheets = wb.getSheets().map((s) => ({ id: s.getSheetId(), name: s.getSheetName() }))
      return groupMatchesBySheet(models.flatMap((m) => m.getMatches()), sheets)
    }

    const activeSheetId = () => univerAPI.getActiveWorkbook()?.getActiveSheet()?.getSheetId() ?? null

    const jump = (hit: SheetHit) => {
      const wb = univerAPI.getActiveWorkbook()
      const sheet = wb?.getSheetBySheetId(hit.sheetId)
      if (!wb || !sheet) return
      if (activeSheetId() !== hit.sheetId) wb.setActiveSheet(sheet)
      // Univer re-picks its current match when the active sheet changes. Give it a
      // tick, then select that match so the highlight, the "n/total" counter and
      // the selection agree; if it did not land on this sheet, use the sheet's
      // first match instead.
      setTimeout(() => {
        service.focusSelection()
        if (activeSheetId() !== hit.sheetId) {
          wb.setActiveSheet(sheet)
          sheet.getRange(hit.row, hit.col).activate()
        }
        // Hand the keyboard back to the find box (Enter keeps stepping matches).
        service.focusFindInput()
      }, 30)
    }

    const render = () => {
      frame = 0
      const state = lastState
      const wrapper = service.revealed ? document.querySelector<HTMLElement>(DIALOG_SELECTOR) : null
      const hits = wrapper && state?.findString && state.findScope === FindScope.UNIT ? computeHits() : []
      if (!wrapper || !hits.length) {
        strip.remove()
        lastSignature = ''
        return
      }
      const activeId = activeSheetId()
      const signature = `${getLang()}|${activeId}|${hits.map((h) => `${h.sheetId}:${h.count}`).join(',')}`
      if (signature === lastSignature && strip.previousElementSibling === wrapper) return
      lastSignature = signature

      strip.dir = document.documentElement.dir || 'ltr'
      const title = document.createElement('div')
      title.className = 'fs-title'
      title.textContent = sheetCountPhrase(hits.length)
      const chips = document.createElement('div')
      chips.className = 'fs-chips'
      for (const hit of hits) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'fs-chip'
        chip.title = t('findSheetsGoto')
        chip.dataset.current = String(hit.sheetId === activeId)
        const name = document.createElement('span')
        name.className = 'fs-name'
        name.textContent = hit.name
        const count = document.createElement('span')
        count.className = 'fs-count'
        count.textContent = String(hit.count)
        chip.append(name, count)
        chip.addEventListener('click', () => jump(hit))
        chips.append(chip)
      }
      strip.replaceChildren(title, chips)
      // Sibling of Univer's own body, inside the Radix dialog root: it moves
      // with the (draggable) dialog and is removed with it when it closes.
      wrapper.after(strip)
    }

    const schedule = () => {
      // A timer, not requestAnimationFrame: this is plain DOM text and must not
      // wait for a paint (a hidden/throttled window never fires the frame).
      if (!frame) frame = window.setTimeout(render, 0)
    }

    let wasRevealed = false
    let wasReplace = false
    let autoScoped = false
    service.state$.subscribe((state) => {
      lastState = state
      // The service's own flag, not state.revealed: state$ replays a made-up
      // initial state with revealed:true to every new subscriber.
      const revealed = service.revealed
      const opened = revealed && !wasRevealed
      const enteredReplace = revealed && state.replaceRevealed && !wasReplace
      wasRevealed = revealed
      wasReplace = state.replaceRevealed
      if (!revealed) autoScoped = false
      // Deferred: changing state from inside its own emission would deliver the
      // two states to Univer's dialog out of order.
      if (opened && !state.replaceRevealed) {
        queueMicrotask(() => {
          if (!service.revealed) return
          autoScoped = true
          service.changeFindScope(FindScope.UNIT)
        })
      } else if (enteredReplace && autoScoped) {
        autoScoped = false
        queueMicrotask(() => service.changeFindScope(FindScope.SUBUNIT))
      }
      schedule()
    })
    // Stepping through matches (Enter) or clicking a sheet tab moves the active
    // sheet; the highlighted chip follows it.
    univerAPI.addEvent(univerAPI.Event.ActiveSheetChanged, schedule)

    registered = true
  } catch {
    // Univer registers its find service while its plugins start, so the injector
    // cannot build it yet on the very first call — retried below.
  }
  return registered
}

export function initFindAllSheets(univer: Univer, univerAPI: FUniver) {
  if (register(univer, univerAPI)) return
  const handle = univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, () => {
    if (register(univer, univerAPI)) handle.dispose()
  })
  for (const delay of [100, 400, 1200]) {
    setTimeout(() => {
      if (registered) return
      if (register(univer, univerAPI)) handle.dispose()
    }, delay)
  }
  setTimeout(() => {
    if (!registered) console.warn('[findAllSheets] find service never registered')
  }, 5000)
}
