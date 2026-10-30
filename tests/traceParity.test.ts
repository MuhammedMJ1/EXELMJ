// The tracer must keep doing exactly what it does today.
//
// "حافظ على ما يفعله الترييس الان" — the working engine was copied to
// backups/trace-working-2026-08-14/ and this suite runs BOTH: the frozen copy
// and the live one, on the same pictures, and requires their SVG to match
// character for character.
//
// That is what makes the speed work safe. The stacked-fields engine and the
// 200-colour palette changed how much the tracer costs, never what it draws,
// and this is the proof — not a claim. It also pins the backup in place: it
// cannot be deleted without the suite going red, which is the restore point
// the whole change was asked to preserve.
import { describe, expect, it } from 'vitest'
import { pathsToSvg, traceImage } from '../src/design/trace'
import { pathsToSvg as oldSvg, traceImage as oldTrace } from '../backups/trace-working-2026-08-14/trace'

function picture(w: number, h: number, seed: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const disc = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (w / 3) ** 2
      const band = Math.floor((x / w) * 5)
      d[o] = disc ? 20 + band * 40 : 230 - band * 12
      d[o + 1] = disc ? 200 - band * 30 : 40 + Math.round(rnd() * 6)
      d[o + 2] = disc ? 90 : 180 - band * 20
      d[o + 3] = 255
    }
  }
  return d
}

describe('tracer parity with the backed-up build', () => {
  for (const [colors, mode] of [[8, 'color'], [4, 'color'], [2, 'bw'], [12, 'grayscale']] as const) {
    it(`identical output at colors=${colors} mode=${mode}`, () => {
      const w = 90
      const h = 70
      const d = picture(w, h, 7)
      const opts = { colors, mode, gradients: true, smooth: true, simplify: 0.6 } as const
      const a = pathsToSvg(traceImage(d.slice(), w, h, { ...opts }), w, h)
      const b = oldSvg(oldTrace(d.slice(), w, h, { ...opts }), w, h)
      expect(a).toBe(b)
    })
  }

  it('identical with strokes and auto colours', () => {
    const w = 80
    const h = 60
    const d = picture(w, h, 3)
    const opts = { colors: 'auto', strokes: true, gradients: false } as const
    expect(pathsToSvg(traceImage(d.slice(), w, h, { ...opts }), w, h)).toBe(
      oldSvg(oldTrace(d.slice(), w, h, { ...opts }), w, h)
    )
  })
})
