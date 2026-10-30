// Images/logos the user places over the artwork (design mode's «صورة» tool).
//
// Same coordinate contract as text boxes and shapes: PDF POINTS from the page's
// TOP-LEFT. The pixels live in the sidecar as a data URL so the placement
// survives a re-open without depending on the source file still being there —
// the manager swaps a client logo once and the file travels with the design.
//
// Only PNG and JPEG are accepted: those are the two formats pdf-lib can embed,
// so anything that lands here is guaranteed to survive the PDF export.

export interface PlacedImage {
  id: string
  /** pt from the page's left edge */
  x: number
  /** pt from the page's top edge */
  y: number
  w: number
  h: number
  /** data:image/png|jpeg;base64,… — validated on the way in AND out */
  src: string
  /** intrinsic pixel size, kept so "reset to original ratio" stays exact */
  naturalW: number
  naturalH: number
  /** visible crop as fractions of the natural size (0..1), left/top/right/bottom */
  crop?: { l: number; t: number; r: number; b: number }
  /**
   * v4, both optional and ABSENT at their default so a v3 sidecar that never
   * used them re-serialises byte-identically.
   */
  /** degrees clockwise about the placed box's centre. Absent === 0. */
  rotation?: number
  /** 0..1. Absent === 1 (fully opaque). */
  opacity?: number
}

export type PageImages = Record<string, PlacedImage[]>

/** pdf-lib embeds exactly these two; anything else must be converted first. */
export const IMAGE_DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/

export function isEmbeddableImage(src: unknown): boolean {
  return typeof src === 'string' && IMAGE_DATA_URL.test(src)
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Fit an image into a box that is at most `maxPt` on its long side, keeping the
 * aspect ratio — what a freshly inserted logo should measure so it never lands
 * bigger than the page.
 */
export function fitIntoPage(
  naturalW: number,
  naturalH: number,
  maxPt: number
): { w: number; h: number } {
  const w = Math.max(1, naturalW)
  const h = Math.max(1, naturalH)
  const scale = Math.min(1, maxPt / Math.max(w, h))
  return { w: w * scale, h: h * scale }
}

/** The source rectangle in PIXELS that a crop selects out of the natural image. */
export function cropRectPx(img: PlacedImage): { sx: number; sy: number; sw: number; sh: number } {
  const c = img.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const sx = clamp01(c.l) * img.naturalW
  const sy = clamp01(c.t) * img.naturalH
  const sw = Math.max(1, img.naturalW * (1 - clamp01(c.l) - clamp01(c.r)))
  const sh = Math.max(1, img.naturalH * (1 - clamp01(c.t) - clamp01(c.b)))
  return { sx, sy, sw, sh }
}

/** A sidecar travels with the file — never trust what it claims. */
export function cleanImage(raw: unknown, index: number): PlacedImage | null {
  if (!raw || typeof raw !== 'object') return null
  const i = raw as Record<string, unknown>
  if (!isEmbeddableImage(i.src)) return null
  const w = num(i.w, 0)
  const h = num(i.h, 0)
  if (w <= 0 || h <= 0) return null
  const c = i.crop as Record<string, unknown> | undefined
  const crop =
    c && typeof c === 'object'
      ? {
          l: clamp01(num(c.l, 0)),
          t: clamp01(num(c.t, 0)),
          r: clamp01(num(c.r, 0)),
          b: clamp01(num(c.b, 0))
        }
      : undefined
  // a crop that removes the whole image would render nothing — drop it instead
  const usable = !crop || (crop.l + crop.r < 0.99 && crop.t + crop.b < 0.99)
  return {
    id: String(i.id ?? `img-${index + 1}`),
    x: num(i.x, 0),
    y: num(i.y, 0),
    w,
    h,
    src: String(i.src),
    naturalW: Math.max(1, num(i.naturalW, w)),
    naturalH: Math.max(1, num(i.naturalH, h)),
    ...(crop && usable ? { crop } : {}),
    ...cleanImageV4(i)
  }
}

/**
 * Drop v4 fields sitting at their default — see stripDefaultV4 in shapes.ts
 * for why the document version depends on this being exact.
 */
export function stripDefaultImageV4(img: PlacedImage): PlacedImage {
  const out: PlacedImage = { ...img }
  const v4 = cleanImageV4(out as unknown as Record<string, unknown>)
  if (v4.rotation) out.rotation = v4.rotation
  else delete out.rotation
  if (v4.opacity !== undefined) out.opacity = v4.opacity
  else delete out.opacity
  return out
}

/** The v4 additions, or {} when every one of them is at its default. */
function cleanImageV4(i: Record<string, unknown>): Partial<PlacedImage> {
  const out: Partial<PlacedImage> = {}
  const raw = Number(i.rotation)
  if (Number.isFinite(raw)) {
    const a = raw % 360
    const norm = a < 0 ? a + 360 : a
    const rot = Math.abs(norm) < 1e-6 || Math.abs(norm - 360) < 1e-6 ? 0 : Math.round(norm * 1000) / 1000
    if (rot) out.rotation = rot
  }
  const op = num(i.opacity, 1)
  if (Number.isFinite(op) && op < 1) out.opacity = Math.max(0, Math.min(1, op))
  return out
}

/** Paint onto a 2D context whose units are PIXELS: k = pixels per pt. */
export function paintImage(
  ctx: CanvasRenderingContext2D,
  img: PlacedImage,
  bitmap: CanvasImageSource,
  k: number
): void {
  const { sx, sy, sw, sh } = cropRectPx(img)
  const plain = !img.rotation && (img.opacity === undefined || img.opacity >= 1)
  if (plain) {
    ctx.drawImage(bitmap, sx, sy, sw, sh, img.x * k, img.y * k, img.w * k, img.h * k)
    return
  }
  ctx.save()
  if (img.opacity !== undefined && img.opacity < 1) ctx.globalAlpha *= Math.max(0, img.opacity)
  if (img.rotation) {
    const cx = (img.x + img.w / 2) * k
    const cy = (img.y + img.h / 2) * k
    ctx.translate(cx, cy)
    ctx.rotate((img.rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, img.x * k, img.y * k, img.w * k, img.h * k)
  ctx.restore()
}
