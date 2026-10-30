// Draws the web edition's app icons from the desktop icon's design.
//
// resources/icon.ico holds one 256×256 PNG: a green rounded square with a
// white table (a header bar over four cells). Its geometry, measured pixel by
// pixel, is redrawn here at the sizes an installable web app needs, so the
// phone icon is the same icon, sharp at every size:
//   icon-192.png, icon-512.png   — "any": transparent corners, as on the desktop
//   icon-maskable-512.png        — "maskable": full-bleed green, the table kept
//                                   inside the safe zone Android crops to
// Usage: node scripts/make-web-icons.mjs   (writes src/web/public/icons/)
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const OUT = 'src/web/public/icons'
const GREEN = [0x1e, 0x71, 0x45]
const WHITE = [0xff, 0xff, 0xff]

// Design units: the 256-px source image.
const BG = { x0: 8, y0: 8, x1: 248, y1: 248, r: 38 }
const TABLE = { x0: 48, y0: 72, x1: 208, y1: 196 }
const CELLS = [
  { x0: 56, y0: 104, x1: 124, y1: 142 },
  { x0: 132, y0: 104, x1: 200, y1: 142 },
  { x0: 56, y0: 150, x1: 124, y1: 188 },
  { x0: 132, y0: 150, x1: 200, y1: 188 }
]

const inRect = (x, y, r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1

function inRounded(x, y, r) {
  if (!inRect(x, y, r)) return false
  const dx = Math.max(r.x0 + r.r - x, 0, x - (r.x1 - r.r))
  const dy = Math.max(r.y0 + r.r - y, 0, y - (r.y1 - r.r))
  return dx * dx + dy * dy <= r.r * r.r
}

/** Colour of one point in design units, or null where the icon is transparent. */
function sample(u, v, maskable) {
  let x = u
  let y = v
  if (maskable) {
    // Keep the table well inside the 80% safe circle: shrink it about the
    // canvas centre, lifted so it sits visually centred.
    x = 128 + (u - 128) / 0.78
    y = 134 + (v - 128) / 0.78
  }
  if (inRect(x, y, TABLE) && !CELLS.some((c) => inRect(x, y, c))) return WHITE
  if (maskable || inRounded(u, v, BG)) return GREEN
  return null
}

function draw(size, maskable) {
  const SS = 4 // 4×4 supersampling per pixel
  const scale = 256 / size
  const px = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let pxX = 0; pxX < size; pxX++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((pxX + (sx + 0.5) / SS) * scale, (py + (sy + 0.5) / SS) * scale, maskable)
          if (!c) continue
          r += c[0]
          g += c[1]
          b += c[2]
          a++
        }
      }
      const o = (py * size + pxX) * 4
      if (a) {
        px[o] = Math.round(r / a)
        px[o + 1] = Math.round(g / a)
        px[o + 2] = Math.round(b / a)
      }
      px[o + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  return encodePng(size, size, px)
}

// --- minimal PNG writer (RGBA, 8 bit, no interlace) ---

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

mkdirSync(OUT, { recursive: true })
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true]
]) {
  const png = draw(size, maskable)
  writeFileSync(`${OUT}/${name}`, png)
  console.log(`${OUT}/${name}  ${size}px  ${png.length} bytes`)
}
