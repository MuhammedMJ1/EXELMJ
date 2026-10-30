// Generates resources/icon.ico (256×256, PNG-compressed ICO) with zero deps:
// a green rounded square holding a white spreadsheet-table glyph.
// Usage: node scripts/make-icon.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const W = 256
const H = 256
const px = new Uint8Array(W * H * 4)

function set(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  px[i] = r
  px[i + 1] = g
  px[i + 2] = b
  px[i + 3] = a
}

function fillRect(x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, r, g, b, a)
}

// --- draw: rounded green square ---
const R = 36
const X0 = 8
const Y0 = 8
const X1 = 248
const Y1 = 248
for (let y = Y0; y < Y1; y++) {
  for (let x = X0; x < X1; x++) {
    const dx = x < X0 + R ? X0 + R - x : x >= X1 - R ? x - (X1 - R - 1) : 0
    const dy = y < Y0 + R ? Y0 + R - y : y >= Y1 - R ? y - (Y1 - R - 1) : 0
    if (dx > 0 && dy > 0 && dx * dx + dy * dy > R * R) continue
    set(x, y, 30, 113, 69)
  }
}

// --- draw: white 2×2 table with a filled header row ---
fillRect(48, 72, 208, 104, 255, 255, 255) // header
fillRect(48, 104, 56, 196, 255, 255, 255) // left border
fillRect(200, 104, 208, 196, 255, 255, 255) // right border
fillRect(48, 188, 208, 196, 255, 255, 255) // bottom border
fillRect(124, 104, 132, 196, 255, 255, 255) // vertical divider
fillRect(48, 142, 208, 150, 255, 255, 255) // horizontal divider

// --- encode PNG ---
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1
  crcTable[n] = c >>> 0
}
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}
function u32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0, 0)
  return b
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const td = Buffer.concat([t, data])
  return Buffer.concat([u32be(data.length), td, u32be(crc32(td))])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0 // filter: none
  Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

// --- wrap in ICO (single 256×256 PNG entry) ---
const ico = Buffer.alloc(6 + 16)
ico.writeUInt16LE(0, 0) // reserved
ico.writeUInt16LE(1, 2) // type: icon
ico.writeUInt16LE(1, 4) // count
ico[6] = 0 // width 256
ico[7] = 0 // height 256
ico.writeUInt16LE(1, 10) // planes
ico.writeUInt16LE(32, 12) // bpp
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18) // offset

mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.ico', Buffer.concat([ico, png]))
console.log(`resources/icon.ico written (${(6 + 16 + png.length).toLocaleString()} bytes)`)
