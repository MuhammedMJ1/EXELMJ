#!/usr/bin/env node
// Extract a shippable icon library from @hugeicons/core-free-icons.
//
// WHY A BUILD SCRIPT AND NOT A RUNTIME DEPENDENCY
// The package is 18 MB across 5,443 separate modules. Shipping it whole would
// add more weight than the rest of the renderer for a feature most documents
// never touch, and bundling 5,443 ES modules would dominate build time. This
// writes ONE JSON file with the icons we actually offer.
//
// THE LICENCE GATE IS THE POINT OF THIS FILE, not a formality.
// Hugeicons ships 54,000+ icons of which only the ~5,400 in core-free-icons
// are MIT; the rest need a paid Pro licence. A hand-copied "it's MIT" note
// would not notice the day that changes, or the day someone installs the Pro
// package instead. So the licence is READ FROM THE PACKAGE and the script
// EXITS NON-ZERO on anything that is not on the permissive list — which fails
// the build rather than shipping something we cannot licence.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'

const PKG = 'node_modules/@hugeicons/core-free-icons'
const OUT = 'resources/icons/hugeicons.json'

/** Licences we may redistribute inside a closed-source desktop app. */
const ALLOWED = new Set(['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'Unlicense'])

/**
 * The icons pinned to the front of the picker.
 *
 * NOT a licence limit — every icon in this package is MIT and all of them are
 * shipped. This list only decides what appears FIRST, because a grid of 5,000
 * glyphs with no ordering is a wall rather than a chooser. Everything else
 * follows alphabetically and is reachable by search.
 */
const WANTED = [
  // navigation and structure
  'Home01', 'Home02', 'Menu01', 'Menu02', 'ArrowLeft01', 'ArrowRight01', 'ArrowUp01', 'ArrowDown01',
  'ArrowLeft02', 'ArrowRight02', 'ChevronLeft', 'ChevronRight', 'MoreHorizontal', 'MoreVertical',
  'Cancel01', 'Cancel02', 'Add01', 'Remove01', 'Tick01', 'Tick02', 'TickDouble01',
  // objects
  'Search01', 'Search02', 'Settings01', 'Settings02', 'User', 'UserCircle', 'UserGroup',
  'Mail01', 'Mail02', 'Notification01', 'Notification02', 'Calendar01', 'Calendar02', 'Clock01',
  'File01', 'File02', 'Folder01', 'Folder02', 'Image01', 'Image02', 'Camera01', 'Video01',
  'Download01', 'Download02', 'Upload01', 'Upload02', 'Share01', 'Share02', 'Link01', 'Link02',
  'Delete01', 'Delete02', 'Edit01', 'Edit02', 'Copy01', 'Copy02', 'Save', 'Printer',
  'Lock', 'LockPassword', 'SquareUnlock01', 'Eye', 'ViewOff', 'View',
  'Star', 'Favourite', 'Bookmark01', 'Bookmark02', 'ThumbsUp', 'ThumbsDown',
  'ShoppingCart01', 'ShoppingBag01', 'CreditCard', 'Wallet01', 'Money01',
  'Chart', 'ChartLineData01', 'PieChart', 'Analytics01', 'DashboardSquare01',
  'Alert01', 'Alert02', 'AlertCircle', 'InformationCircle', 'HelpCircle', 'CheckmarkCircle01',
  'Loading01', 'Loading02', 'Refresh', 'Filter', 'Sorting01', 'Grid', 'ListView',
  'Play', 'Pause', 'Stop', 'VolumeHigh', 'VolumeOff', 'Mic01', 'MicOff01',
  'Sun01', 'Moon01', 'Wifi01', 'WifiOff01', 'Bluetooth', 'Battery',
  'Location01', 'Location02', 'Globe', 'LanguageCircle', 'Translate',
  'SmartPhone01', 'Call', 'Message01', 'Message02', 'Chatting01', 'Comment01',
  'PaintBoard', 'PaintBrush01', 'ColorPicker', 'Layers01', 'Crop', 'Text', 'TextFont',
  'Code', 'CodeSquare', 'Terminal', 'Database', 'ServerStack01', 'Cloud', 'CloudUpload'
]

const die = (msg) => {
  console.error(`[pick-icons] ${msg}`)
  process.exit(1)
}

async function main() {
  let pkg
  try {
    pkg = JSON.parse(await readFile(path.join(PKG, 'package.json'), 'utf8'))
  } catch {
    die(`${PKG} is not installed. Run: npm i --save-dev @hugeicons/core-free-icons`)
  }

  // THE GATE. Read, never assumed.
  if (!ALLOWED.has(pkg.license)) {
    die(
      `REFUSING to ship icons: @hugeicons/core-free-icons@${pkg.version} declares licence "${pkg.license}", ` +
        `which is not on the permissive list (${[...ALLOWED].join(', ')}). ` +
        `Hugeicons PRO icons require a paid licence and must never reach resources/.`
    )
  }
  // A second guard against the likeliest mistake: installing the pro package
  // and pointing this script at it.
  if (!pkg.name.includes('core-free-icons')) {
    die(`REFUSING: expected @hugeicons/core-free-icons, found "${pkg.name}". Only the FREE set is MIT.`)
  }

  const dir = path.join(PKG, 'dist/esm')
  const files = (await readdir(dir)).filter((f) => f.endsWith('Icon.js'))
  const byBase = new Map(files.map((f) => [f.replace(/Icon\.js$/, ''), f]))

  const icons = []
  const missing = []
  const ALL = !process.argv.includes('--curated')
  // The fallback lookup below strips a trailing "Icon", so two WANTED entries
  // can resolve to the SAME file ("PrinterIcon" and "Printer"). Deduping by
  // the resolved file is what keeps names unique — a duplicate would make
  // "insert by name" ambiguous.
  const taken = new Set()
  for (const want of WANTED) {
    const file = byBase.get(want) ?? byBase.get(want.replace(/Icon$/, ''))
    if (!file) {
      missing.push(want)
      continue
    }
    if (taken.has(file)) continue
    taken.add(file)
    const src = await readFile(path.join(dir, file), 'utf8')
    const paths = parseIcon(src)
    if (!paths.length) {
      missing.push(`${want} (no paths)`)
      continue
    }
    icons.push({ name: file.replace(/Icon\.js$/, ''), paths })
  }

  const pinnedCount = icons.length
  // Everything else, alphabetically, after the pinned ones. This is the part
  // that makes the library complete rather than a sample.
  if (ALL) {
    for (const [base, file] of byBase) {
      if (taken.has(file)) continue
      taken.add(file)
      const paths = parseIcon(await readFile(path.join(dir, file), 'utf8'))
      if (paths.length) icons.push({ name: base, paths })
    }
  }

  if (!icons.length) die('nothing extracted — the package layout must have changed')

  await mkdir(path.dirname(OUT), { recursive: true })
  const doc = {
    source: `${pkg.name}@${pkg.version}`,
    license: pkg.license,
    // The grid the artwork is drawn on. Hugeicons is 24 with a 1.5 stroke;
    // recording it means the panel never has to guess.
    grid: 24,
    strokeWidth: 1.5,
    /** How many of `icons` are the pinned, hand-picked ones at the front. */
    pinned: pinnedCount,
    // Pinned first (in the order above), then everything else alphabetically —
    // a re-run diffs cleanly because both halves have a fixed order.
    icons: [
      ...icons.slice(0, pinnedCount),
      ...icons.slice(pinnedCount).sort((a, b) => (a.name < b.name ? -1 : 1))
    ]
  }
  await writeFile(OUT, `${JSON.stringify(doc, null, 1)}\n`)

  const kb = Math.round(JSON.stringify(doc).length / 1024)
  console.log(
    `[pick-icons] ${icons.length} icons (${pinnedCount} pinned) -> ${OUT} (${kb} KB, ${pkg.license})`
  )
  // Report what was asked for and not found, rather than silently shipping a
  // shorter library than the list promises.
  if (missing.length) console.warn(`[pick-icons] not found: ${missing.join(', ')}`)
}

/**
 * Pull the path data out of one icon module.
 *
 * The modules are `[["path", { d: "...", strokeWidth: "1.5", ... }], ...]`.
 * Parsed by regex rather than by importing them: importing 5,443 ES modules
 * costs seconds, and a regex over a file whose shape is this rigid is both
 * faster and unable to execute anything the package ships.
 */
function parseIcon(src) {
  const out = []
  const re = /\["(path|circle|rect|line|ellipse|polyline|polygon)",\s*\{([^}]*)\}\]/g
  let m
  while ((m = re.exec(src))) {
    const [, tag, attrs] = m
    // Only `d`-bearing marks survive: the canvas speaks paths, and converting
    // a <circle> here would duplicate geometry the design module already owns.
    const d = /\bd:\s*"([^"]+)"/.exec(attrs)?.[1]
    if (tag !== 'path' || !d) continue
    const strokeWidth = Number(/strokeWidth:\s*"([\d.]+)"/.exec(attrs)?.[1] ?? 1.5)
    const filled = /\bfill:\s*"(?!none)/.test(attrs)
    out.push({ d, strokeWidth, filled })
  }
  return out
}

await main()
