import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { bundleFiles, dataUrlToBytes, toZip } from '../src/studio/bundle'
import { BUNDLE_FILES } from '../src/studio/handoff'
import type { HandoffInput } from '../src/studio/handoff'
import { emptyStudioDoc } from '../src/studio/model'
import { newBox } from '../src/design/overlayModel'
import { scaleToGroup } from '../src/studio/color/tokens'
import { scaleFrom } from '../src/studio/color/scale'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function input(withTokens = true): HandoffInput {
  const studio = emptyStudioDoc()
  if (withTokens) studio.tokens.base = { color: { brand: scaleToGroup(scaleFrom('#185abd')!) } }
  return {
    name: 'Design',
    writer: '0.2.2',
    generatedAt: '2026-08-14T00:00:00.000Z',
    pages: { '1': [{ ...newBox('b1', 10, 10, true), text: 'مرحبا' }] },
    shapes: {
      '1': [
        { id: 's1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#185abd', stroke: '', strokeWidth: 2 },
        {
          id: 's2',
          kind: 'path',
          x: 5,
          y: 5,
          w: 20,
          h: 20,
          fill: '#ff0000',
          stroke: '',
          strokeWidth: 1,
          d: 'M0 0 L20 0 L20 20 Z'
        }
      ]
    },
    images: {
      '1': [{ id: 'i1', x: 0, y: 0, w: 10, h: 10, src: PNG, naturalW: 1, naturalH: 1 }]
    },
    studio
  }
}

const paths = (i = input()): string[] => bundleFiles(i).map((f) => f.path)
const fileAt = (p: string, i = input()) => bundleFiles(i).find((f) => f.path === p)

describe('the bundle contents', () => {
  it('always carries a manifest and a spec', () => {
    expect(paths()).toContain(BUNDLE_FILES.manifest)
    expect(paths()).toContain(BUNDLE_FILES.spec)
  })

  it('carries tokens in both formats when there are any', () => {
    expect(paths()).toContain(BUNDLE_FILES.tokensJson)
    expect(paths()).toContain(BUNDLE_FILES.tokensCss)
  })

  it('OMITS the token files entirely when there are none', () => {
    const p = paths(input(false))
    expect(p).not.toContain(BUNDLE_FILES.tokensJson)
    expect(p).not.toContain(BUNDLE_FILES.tokensCss)
  })

  it('writes images as real files, not base64 inside the spec', () => {
    expect(paths().some((p) => p.startsWith('assets/') && p.endsWith('.png'))).toBe(true)
    expect(fileAt(BUNDLE_FILES.spec)!.text).not.toContain('base64')
  })

  it('writes vector artwork as an SVG the agent can use directly', () => {
    const svg = paths().find((p) => p.endsWith('-vectors.svg'))
    expect(svg).toBeTruthy()
    expect(fileAt(svg!)!.text).toContain('<path d="M0 0 L20 0 L20 20 Z"')
  })

  it('does not emit an SVG for a page with no paths', () => {
    const i = input()
    i.shapes = { '1': [i.shapes['1'][0]] }
    expect(paths(i).some((p) => p.endsWith('-vectors.svg'))).toBe(false)
  })

  it('QUARANTINES our own reload file under source/', () => {
    expect(paths()).toContain(BUNDLE_FILES.source)
    expect(BUNDLE_FILES.source.startsWith('source/')).toBe(true)
  })

  it('the reload file is a real sidecar that parses back', () => {
    const raw = JSON.parse(fileAt(BUNDLE_FILES.source)!.text!)
    expect([3, 4]).toContain(raw.version)
    expect(raw.pages['1'][0].text).toBe('مرحبا')
  })
})

describe('the manifest', () => {
  const manifest = () => JSON.parse(fileAt(BUNDLE_FILES.manifest)!.text!)

  it('lists every file in the bundle', () => {
    const m = manifest()
    for (const p of paths()) {
      if (p === BUNDLE_FILES.manifest) continue
      expect(m.files).toContain(p)
    }
  })

  it('declares the unit and the direction', () => {
    const m = manifest()
    expect(m.units.length).toBe('pt')
    expect(m.direction.logicalPropertiesOnly).toBe(true)
  })

  it('carries the not-specified list', () => {
    expect(manifest().notSpecified.length).toBeGreaterThan(0)
  })
})

describe('determinism — two exports of one design must diff cleanly', () => {
  it('sorts the file list', () => {
    const p = paths()
    expect([...p].sort()).toEqual(p)
  })

  it('produces identical bytes twice', async () => {
    const a = await toZip(input())
    const b = await toZip(input())
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it('produces identical file contents twice', () => {
    expect(JSON.stringify(bundleFiles(input()))).toBe(JSON.stringify(bundleFiles(input())))
  })

  it('CHANGES when the design changes', async () => {
    const a = await toZip(input())
    const other = input()
    other.pages['1'][0].text = 'different'
    const b = await toZip(other)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
})

describe('the ZIP itself', () => {
  it('unzips to exactly the files we listed', async () => {
    const zip = await JSZip.loadAsync(await toZip(input()))
    // JSZip synthesises a DIRECTORY entry for every path segment; those are
    // structure, not content, so only the file entries are compared.
    const entries = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name)
    expect(entries.sort()).toEqual(paths().sort())
  })

  it('round-trips the Arabic text intact', async () => {
    const zip = await JSZip.loadAsync(await toZip(input()))
    const spec = await zip.file(BUNDLE_FILES.spec)!.async('string')
    expect(spec).toContain('مرحبا')
  })

  it('round-trips the image bytes intact', async () => {
    const zip = await JSZip.loadAsync(await toZip(input()))
    const name = paths().find((p) => p.endsWith('.png'))!
    const out = await zip.file(name)!.async('uint8array')
    expect(out).toEqual(dataUrlToBytes(PNG))
  })

  it('uses a fixed timestamp on every FILE, so the archive is reproducible', async () => {
    const zip = await JSZip.loadAsync(await toZip(input()))
    for (const f of Object.values(zip.files)) {
      // Synthesised directory entries carry the write time and are not ours to
      // set; the bytes that matter are the files, and they must not move.
      if (f.dir) continue
      expect(f.date.getUTCFullYear(), f.name).toBe(1980)
    }
  })
})

describe('dataUrlToBytes', () => {
  it('decodes a png data url', () => {
    const b = dataUrlToBytes(PNG)!
    expect(b[0]).toBe(0x89)
    expect(b[1]).toBe(0x50)
  })

  it('refuses anything that is not an inline png or jpeg', () => {
    expect(dataUrlToBytes('https://x/y.png')).toBe(null)
    expect(dataUrlToBytes('data:image/svg+xml;base64,PHN2Zz4=')).toBe(null)
    expect(dataUrlToBytes('data:image/png;base64,not!base64')).toBe(null)
  })
})

describe('the SVG asset is safe', () => {
  it('drops path data that fails the safety guard', () => {
    const i = input()
    i.shapes['1'][1].d = 'M0 0 url(#evil)'
    const svg = paths(i).find((p) => p.endsWith('-vectors.svg'))
    expect(svg).toBeFalsy()
  })

  it('refuses a colour that is not a hex rather than writing it', () => {
    const i = input()
    i.shapes['1'][1].fill = 'red;}</style>'
    const name = paths(i).find((p) => p.endsWith('-vectors.svg'))!
    const text = fileAt(name, i)!.text!
    expect(text).not.toContain('</style>')
    expect(text).toContain('fill="none"')
  })
})
