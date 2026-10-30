// EXELMJ RTL alignment fix.
//
// rtlMirror.ts fakes right-to-left sheets by flipping the whole grid host with
// CSS scaleX(-1) (Univer 0.25.1 ships no RTL renderer). The flip mirrors the
// COLUMN order — exactly what we want — but it ALSO mirrors where the content
// sits INSIDE each cell: a cell the file explicitly aligns RIGHT is painted at
// its right edge and the flip lands it on the visual LEFT. Reported by the
// manager against Google Sheets, whose RTL view keeps such cells hugging the
// right edge (his report .xlsx carries horizontal="right" on every cell).
//
// Fix: on RTL sheets swap the EXPLICIT horizontal alignment (left ⇄ right) at
// RENDER time only, via the cell-content interceptor's `interceptorStyle`
// (Styles.getStyleByCell merges it over the cell's own style). After the flip
// every cell lands on the side the file asked for, and the toolbar's align
// buttons read correctly too. Cells with NO explicit alignment are left alone,
// so General keeps Excel's RTL behaviour (text right, numbers left). Nothing is
// written to the workbook, so autosave, saving and xlsx export are untouched.
import { InterceptorEffectEnum, type FUniver, type Univer } from '@univerjs/presets'
import { INTERCEPTOR_POINT, SheetInterceptorService } from '@univerjs/presets/preset-sheets-core'

const H_LEFT = 1
const H_RIGHT = 3

/**
 * Explicit left ⇄ right only. Center/justified/distributed are symmetric under
 * the mirror, and an unset alignment must keep the mirrored default.
 */
export function swapHAlign(ht: unknown): number | undefined {
  if (ht === H_LEFT) return H_RIGHT
  if (ht === H_RIGHT) return H_LEFT
  return undefined
}

type CellLike = { interceptorStyle?: Record<string, unknown> } | null | undefined

type CellLocation = {
  worksheet: { getConfig(): { rightToLeft?: number } }
  workbook: { getStyles(): { getStyleByCell(cell: unknown): { ht?: number } | undefined } }
}

let registered = false

function register(univer: Univer): boolean {
  if (registered) return true
  try {
    const injector = (
      univer as unknown as { __getInjector(): { get(token: unknown): unknown } }
    ).__getInjector()
    const interceptors = injector.get(SheetInterceptorService) as {
      intercept(point: unknown, interceptor: unknown): unknown
    }
    interceptors.intercept(INTERCEPTOR_POINT.CELL_CONTENT, {
      effect: InterceptorEffectEnum.Style,
      // Lowest priority: data validation (9) and numfmt (10) run first, so the
      // style we read here is the final one the chain produced.
      priority: 0,
      handler: (cell: CellLike, pos: CellLocation, next: (c: CellLike) => CellLike) => {
        const out = next(cell)
        if (!out) return out
        try {
          if (pos.worksheet.getConfig().rightToLeft !== 1) return out
          const swapped = swapHAlign(pos.workbook.getStyles().getStyleByCell(out)?.ht)
          if (swapped === undefined) return out
          return { ...out, interceptorStyle: { ...out.interceptorStyle, ht: swapped } }
        } catch {
          return out // never break rendering over an alignment tweak
        }
      }
    })
    registered = true
  } catch {
    // Univer registers its sheet services while its plugins start, so the
    // injector cannot build them yet on the very first call — retried below.
  }
  return registered
}

export function initRtlAlign(univer: Univer, univerAPI: FUniver) {
  if (register(univer)) return
  const handle = univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, () => {
    if (register(univer)) handle.dispose()
  })
  // Belt and braces: the lifecycle event alone is enough in practice, but the
  // interceptor must be in place before the first real workbook renders.
  for (const delay of [100, 400, 1200]) {
    setTimeout(() => {
      if (registered) return
      if (register(univer)) handle.dispose()
    }, delay)
  }
  setTimeout(() => {
    if (!registered) console.warn('[rtlAlign] alignment interceptor never registered')
  }, 5000)
}
