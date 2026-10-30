// Which installed faces a font picker may offer.
//
// Windows reports hidden system entries (". Semi", "@Batang") and, on this
// machine, one blank name. None of them are valid CSS identifiers, so picking
// one wrote `font-family: . Semi` — a declaration the CSS parser drops, making
// the picker look broken. They are filtered out at the source, which keeps
// both the sheet's picker and the word ribbon honest.
//
// Its own module (not ribbon.ts) so main.ts can use it without pulling the
// whole word bundle into the first paint.
export function usableFonts(fonts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of fonts) {
    const name = String(raw ?? '').trim()
    if (!name || name.startsWith('.') || name.startsWith('@')) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}
