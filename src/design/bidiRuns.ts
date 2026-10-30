// Bidi handling for pdf-lib output — the ONE gap fontkit leaves.
//
// Proven on this machine (scratch probe, content-stream level): pdf-lib's
// fontkit applies full Arabic GSUB shaping AND reverses a pure-RTL line into
// visual order, so logical-order Arabic must be passed UNCHANGED. But it has
// no UAX#9: it flips the WHOLE line, so embedded LTR runs (digits, Latin)
// come out mirrored — «07717835312» rendered «21353871770». Pre-reversing
// ONLY those LTR runs cancels the flip exactly.
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

/**
 * Number/latin islands inside an RTL line — these run visually LTR, so they
 * need the pre-reverse. Arabic-Indic digits (٠-٩ / ۰-۹) behave like European
 * digits here (review finding: they came out mirrored).
 */
const LTR_RUN_RE = /[0-9٠-٩۰-۹A-Za-z](?:[0-9٠-٩۰-۹A-Za-z .:/+،,-]*[0-9٠-٩۰-۹A-Za-z])?/g

/** Arabic Presentation Forms-A / -B: the SHAPED glyph codepoints a PDF stores
 * instead of the letters themselves. */
const AR_PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻿]/

/**
 * pdf.js hands back whatever the PDF encoded — for Arabic that is usually
 * presentation forms (ﻞ ﻴ ﺼ …), not real letters. They LOOK right on screen but
 * are not Arabic text: retyping part of a run mixes the two shapes, and the
 * Word export carries glyph codepoints Word cannot join or search. NFKC maps
 * every form back to its base letter (and splits the lam-alef ligature), so the
 * whole app downstream sees ordinary Arabic.
 */
// Look-alikes a PDF's glyph map hands back for ordinary Arabic letters: the
// Persian yeh/keheh/heh-goal carry the same shapes, so Arabic text extracted
// from a PDF comes out spelled with them and no search or spell check matches.
// Mapped back only inside text that is already Arabic.
const PERSIAN_LOOKALIKES: Record<string, string> = {
  'ی': 'ي', // ی → ي
  'ک': 'ك', // ک → ك
  'ھ': 'ه', // ھ → ه
  'ہ': 'ه', // ہ → ه
  'ے': 'ي' // ے → ي
}

export function normalizeArabicText(s: string): string {
  const out = AR_PRESENTATION_FORMS.test(s) ? s.normalize('NFKC') : s
  if (!ARABIC_RE.test(out)) return out
  return out.replace(/[یکھہے]/g, (ch) => PERSIAN_LOOKALIKES[ch] ?? ch)
}

export function lineIsRtl(line: string): boolean {
  return ARABIC_RE.test(line)
}

/**
 * Prepare one LOGICAL-order line for pdf-lib drawText.
 * RTL lines: reverse each embedded LTR run (fontkit will flip the whole line
 * back, leaving Arabic in visual order AND the runs readable).
 * Pure-LTR lines pass through untouched.
 */
export function toPdfVisual(line: string): string {
  if (!lineIsRtl(line)) return line
  return line.replace(LTR_RUN_RE, (run) => {
    // trailing/leading spaces never match; inner separators travel with the run
    return [...run].reverse().join('')
  })
}
