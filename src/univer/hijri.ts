// Hijri (Umm al-Qura) calendar functions — a regional differentiator no free
// Excel alternative ships. Registered as custom formula functions:
//   HIJRI(serial)      → "1447/01/15"  (yyyy/mm/dd, latin digits — the Hindi
//                         digits display toggle transliterates them on screen)
//   HIJRITEXT(serial)  → "١٥ محرم ١٤٤٧" (long month name, Arabic)
//   HIJRIDAY/HIJRIMONTH/HIJRIYEAR(serial) → numbers
//   HIJRITODAY()       → today as HIJRI()
// Excel knows none of these, so the exporter writes their computed VALUES and
// stashes the formulas in _EXELMJ_META; reopening in EXELMJ restores them.
import type { FUniver } from '@univerjs/presets'

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

export const HIJRI_FN_RE = /\b(HIJRITEXT|HIJRITODAY|HIJRIDAY|HIJRIMONTH|HIJRIYEAR|HIJRI)\s*\(/i

const numericFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC'
})
const longFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC'
})

function serialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_UTC + serial * DAY_MS)
}

function coerceNumber(arg: unknown): number | null {
  let v = arg
  if (Array.isArray(v)) v = (v as unknown[][])[0]?.[0]
  if (v && typeof v === 'object' && 'v' in (v as Record<string, unknown>)) v = (v as { v: unknown }).v
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function hijriParts(serial: number): { year: number; month: number; day: number } | null {
  try {
    const parts = numericFmt.formatToParts(serialToDate(serial))
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN)
    const year = get('year')
    const month = get('month')
    const day = get('day')
    if (![year, month, day].every(Number.isFinite)) return null
    return { year, month, day }
  } catch {
    return null
  }
}

export function hijriFromSerial(serial: number): string {
  const p = hijriParts(serial)
  if (!p) return '#VALUE!'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}/${pad(p.month)}/${pad(p.day)}`
}

export function hijriTextFromSerial(serial: number): string {
  try {
    return longFmt.format(serialToDate(serial)).replace(/‏/g, '')
  } catch {
    return '#VALUE!'
  }
}

/** A calendar date as the serial the hijri helpers take. */
export function serialFromDate(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((utc - EXCEL_EPOCH_UTC) / DAY_MS)
}

export function todaySerial(): number {
  return Math.floor((Date.now() - EXCEL_EPOCH_UTC) / DAY_MS)
}

export function registerHijriFunctions(univerAPI: FUniver) {
  // Registering BEFORE the formula engine is fully up "poisons" the names
  // (they land in a dead registry; duplicate registrations are silently
  // ignored afterwards — verified live). Register once the lifecycle reaches
  // Rendered/Steady, with a timer fallback.
  let done = false
  const doRegister = () => {
    if (done) return
    done = true
    let formula: {
      registerFunction(name: string, fn: (...args: unknown[]) => unknown, desc?: string): unknown
    }
    try {
      formula = (univerAPI as unknown as { getFormula(): typeof formula }).getFormula()
    } catch (err) {
      console.warn('[hijri] formula engine unavailable', err)
      return
    }
    const withSerial = (fn: (serial: number) => unknown) => (arg: unknown) => {
      const serial = coerceNumber(arg)
      return serial == null ? '#VALUE!' : fn(serial)
    }
    try {
      formula.registerFunction('HIJRI', withSerial(hijriFromSerial), 'التاريخ الهجري (أم القرى) بصيغة سنة/شهر/يوم')
      formula.registerFunction('HIJRITEXT', withSerial(hijriTextFromSerial), 'التاريخ الهجري باسم الشهر')
      formula.registerFunction('HIJRIDAY', withSerial((s) => hijriParts(s)?.day ?? '#VALUE!'), 'اليوم الهجري')
      formula.registerFunction('HIJRIMONTH', withSerial((s) => hijriParts(s)?.month ?? '#VALUE!'), 'الشهر الهجري')
      formula.registerFunction('HIJRIYEAR', withSerial((s) => hijriParts(s)?.year ?? '#VALUE!'), 'السنة الهجرية')
      formula.registerFunction('HIJRITODAY', () => hijriFromSerial(todaySerial()), 'تاريخ اليوم هجرياً')
    } catch (err) {
      console.warn('[hijri] registerFunction failed', err)
    }
  }
  try {
    const event = (univerAPI as unknown as { Event?: { LifeCycleChanged?: unknown } }).Event
      ?.LifeCycleChanged
    if (event) {
      univerAPI.addEvent(event as never, (e: unknown) => {
        const stage = (e as { stage?: number | string })?.stage
        if (stage === 2 || stage === 3 || stage === 'Rendered' || stage === 'Steady') doRegister()
      })
    }
  } catch {
    // lifecycle event unavailable — rely on the timer
  }
  setTimeout(doRegister, 1800)
}
