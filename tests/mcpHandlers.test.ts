import { describe, expect, it } from 'vitest'
import { runStudioTool, type DocumentView } from '../src/studio/mcpHandlers'
import type { HandoffInput } from '../src/studio/handoff'
import { emptyStudioDoc } from '../src/studio/model'
import { newBox } from '../src/design/overlayModel'
import { scaleToGroup } from '../src/studio/color/tokens'
import { scaleFrom } from '../src/studio/color/scale'

function doc(withTokens = false): HandoffInput {
  const studio = emptyStudioDoc()
  if (withTokens) studio.tokens.base = { color: { brand: scaleToGroup(scaleFrom('#185abd')!) } }
  studio.components = [
    {
      id: 'card',
      name: 'Card',
      type: 'card',
      content: {
        boxes: [],
        shapes: [
          { id: 's', kind: 'rect', x: 0, y: 0, w: 100, h: 60, fill: '#185abd', stroke: '', strokeWidth: 2 }
        ],
        images: []
      },
      slots: [{ id: 's', label: 'Fill', kind: 'color' }]
    }
  ]
  return {
    name: 'Doc',
    writer: '0.2.2',
    generatedAt: '2026-08-14T00:00:00.000Z',
    pages: { '1': [{ ...newBox('b1', 10, 10, true), text: 'مرحبا' }] },
    shapes: {},
    images: {},
    studio
  }
}

function view(over: Partial<DocumentView> = {}, d: HandoffInput | null = doc()): DocumentView {
  return {
    handoff: () => d,
    placeComponent: () => 'inst-1',
    markDirty: () => undefined,
    ...over
  }
}

type Result = Awaited<ReturnType<typeof runStudioTool>>

const data = (r: Result): any => {
  expect(r.ok).toBe(true)
  return (r as { ok: true; data: unknown }).data
}

describe('studio_status', () => {
  it('works with no document open and SAYS so', async () => {
    const r = await runStudioTool(view({}, null), 'studio_status', {})
    expect(data(r).hasDocument).toBe(false)
    expect(data(r).notes[0]).toContain('No design is open')
  })

  it('reports the document and the device pills', async () => {
    const d = data(await runStudioTool(view(), 'studio_status', {}))
    expect(d.hasDocument).toBe(true)
    expect(d.artboards).toBe(1)
    expect(d.devices.map((x: { id: string }) => x.id)).toEqual(['desktop', 'tablet', 'mobile'])
  })
})

describe('studio_describe_design', () => {
  it('refuses politely with no document', async () => {
    const r = await runStudioTool(view({}, null), 'studio_describe_design', {})
    expect(r.ok).toBe(false)
    expect((r as { code: string }).code).toBe('NO_DOCUMENT')
  })

  it('returns the markdown spec', async () => {
    const md = data(await runStudioTool(view(), 'studio_describe_design', {})) as string
    expect(md).toContain('# Doc — design handoff')
    expect(md).toContain('Units are POINTS')
  })

  it('scopes to one artboard', async () => {
    const md = data(await runStudioTool(view(), 'studio_describe_design', { page: '1' })) as string
    expect(md).toContain('Artboard 1')
  })

  it('reports an unknown artboard rather than returning an empty doc', async () => {
    const r = await runStudioTool(view(), 'studio_describe_design', { page: '9' })
    expect(r.ok).toBe(false)
    expect((r as { code: string }).code).toBe('NOT_FOUND')
  })

  it('truncates to a budget and SAYS what it dropped', async () => {
    const r = await runStudioTool(view(), 'studio_describe_design', { budgetTokens: 60 })
    expect(r.ok).toBe(true)
    expect((r as { dropped?: string[] }).dropped?.[0]).toContain('characters after this point')
  })

  it('does not truncate when it fits', async () => {
    const r = await runStudioTool(view(), 'studio_describe_design', { budgetTokens: 100000 })
    expect((r as { dropped?: string[] }).dropped).toBe(undefined)
  })
})

describe('studio_get_tokens', () => {
  it('tells the caller what to do when there are none, rather than returning {}', async () => {
    const r = await runStudioTool(view({}, doc(false)), 'studio_get_tokens', {})
    expect(r.ok).toBe(false)
    expect((r as { detail: string }).detail).toContain('studio_make_scale')
  })

  it('returns DTCG by default', async () => {
    const out = data(await runStudioTool(view({}, doc(true)), 'studio_get_tokens', {})) as string
    expect(JSON.parse(out).color.brand['600'].$type).toBe('color')
  })

  it('returns CSS when asked', async () => {
    const out = data(await runStudioTool(view({}, doc(true)), 'studio_get_tokens', { format: 'css' })) as string
    expect(out).toContain('--color-brand-600:')
  })
})

describe('studio_list_components / get_component', () => {
  it('lists with sizes and slot counts', async () => {
    const d = data(await runStudioTool(view(), 'studio_list_components', {}))
    expect(d.components).toHaveLength(1)
    expect(d.components[0].size.w).toBe(100)
    expect(d.components[0].slots).toBe(1)
  })

  it('filters by name and by kind', async () => {
    expect(data(await runStudioTool(view(), 'studio_list_components', { query: 'car' })).components).toHaveLength(1)
    expect(data(await runStudioTool(view(), 'studio_list_components', { query: 'zzz' })).components).toHaveLength(0)
    expect(data(await runStudioTool(view(), 'studio_list_components', { kind: 'card' })).components).toHaveLength(1)
  })

  it('returns one component with its unit note', async () => {
    const d = data(await runStudioTool(view(), 'studio_get_component', { id: 'card' }))
    expect(d.id).toBe('card')
    expect(d.units).toBe('pt')
    expect(d.note).toContain('1.3333')
  })

  it('reports a missing component', async () => {
    expect((await runStudioTool(view(), 'studio_get_component', { id: 'nope' })).ok).toBe(false)
  })
})

describe('studio_place_component', () => {
  it('places and returns the instance id', async () => {
    let dirty = false
    const r = await runStudioTool(
      view({ markDirty: () => { dirty = true } }),
      'studio_place_component',
      { componentId: 'card', page: '1', x: 10, y: 20 }
    )
    expect(data(r).instanceId).toBe('inst-1')
    expect(dirty).toBe(true)
  })

  it('validates its inputs rather than placing something at NaN', async () => {
    expect((await runStudioTool(view(), 'studio_place_component', { componentId: 'card', page: '1' })).ok).toBe(false)
    expect(
      (await runStudioTool(view(), 'studio_place_component', {
        componentId: 'card',
        page: '1',
        x: 'left',
        y: 0
      })).ok
    ).toBe(false)
  })

  it('refuses an unknown component', async () => {
    const r = await runStudioTool(view(), 'studio_place_component', {
      componentId: 'nope',
      page: '1',
      x: 0,
      y: 0
    })
    expect((r as { code: string }).code).toBe('NOT_FOUND')
  })

  it('reports a failed placement instead of claiming success', async () => {
    const r = await runStudioTool(view({ placeComponent: () => null }), 'studio_place_component', {
      componentId: 'card',
      page: '1',
      x: 0,
      y: 0
    })
    expect(r.ok).toBe(false)
  })
})

describe('studio_make_scale', () => {
  it('creates a scale and stores it under the named group', async () => {
    const d = doc()
    const r = await runStudioTool(view({}, d), 'studio_make_scale', { seed: '#185abd', name: 'primary' })
    expect(data(r).group).toBe('primary')
    expect(Object.keys(data(r).scale)).toHaveLength(11)
    expect((d.studio.tokens.base.color as Record<string, unknown>).primary).toBeTruthy()
  })

  it('derives the dark theme only when asked', async () => {
    const d = doc()
    await runStudioTool(view({}, d), 'studio_make_scale', { seed: '#185abd' })
    expect(d.studio.tokens.dark).toBe(undefined)
    await runStudioTool(view({}, d), 'studio_make_scale', { seed: '#185abd', dark: true })
    expect(d.studio.tokens.dark).toBeTruthy()
  })

  it('rejects a non-hex seed', async () => {
    expect((await runStudioTool(view(), 'studio_make_scale', { seed: 'blue' })).ok).toBe(false)
    expect((await runStudioTool(view(), 'studio_make_scale', {})).ok).toBe(false)
  })

  it('explains WHY the scale is built that way', async () => {
    expect(data(await runStudioTool(view(), 'studio_make_scale', { seed: '#185abd' })).note).toContain(
      'equally light'
    )
  })
})

describe('studio_check_contrast', () => {
  it('gives a verdict, not just a number', async () => {
    const d = data(await runStudioTool(view(), 'studio_check_contrast', {
      foreground: '#000000',
      background: '#ffffff'
    }))
    expect(d.verdict).toBe('AAA')
    expect(d.ratio).toBe(21)
    expect(d.passesBody).toBe(true)
  })

  it('SUGGESTS a fix when it fails', async () => {
    const d = data(await runStudioTool(view(), 'studio_check_contrast', {
      foreground: '#bbbbbb',
      background: '#ffffff'
    }))
    expect(d.verdict).toBe('Fail')
    expect(d.suggested).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('says plainly when no colour of that hue can reach the target', async () => {
    const d = data(await runStudioTool(view(), 'studio_check_contrast', {
      foreground: '#808080',
      background: '#7f7f7f',
      target: 21
    }))
    expect(d.note).toContain('No colour of that hue')
  })

  it('always offers a readable foreground for the background', async () => {
    const d = data(await runStudioTool(view(), 'studio_check_contrast', {
      foreground: '#123456',
      background: '#000000'
    }))
    expect(d.readableForeground).toBe('#ffffff')
  })

  it('rejects non-hex input', async () => {
    expect(
      (await runStudioTool(view(), 'studio_check_contrast', { foreground: 'red', background: '#fff' })).ok
    ).toBe(false)
  })

  it('works without a document — it is pure colour maths', async () => {
    expect(
      (await runStudioTool(view({}, null), 'studio_check_contrast', {
        foreground: '#000000',
        background: '#ffffff'
      })).ok
    ).toBe(true)
  })
})

describe('the browser tools', () => {
  const browser = (over: Partial<NonNullable<DocumentView['browser']>> = {}) => ({
    open: async () => ({ ok: true }),
    setDevice: async () => ({ ok: true }),
    screenshot: async () => ({ ok: true, path: 'C:\tmp\shot.png' }),
    lastCapture: () => null,
    importCapture: () => ({ ok: true, detail: 'imported 1 object' }),
    ...over
  })

  it('says plainly when there is no browser in this window', async () => {
    for (const name of ['browser_open', 'browser_set_device', 'browser_screenshot', 'picker_pick']) {
      const r = await runStudioTool(view(), name, { url: 'studio://x/', device: 'mobile' })
      expect(r.ok, name).toBe(false)
      expect((r as { code: string }).code, name).toBe('UNSUPPORTED')
    }
  })

  it('opens a url and tells the caller to set the device next', async () => {
    let opened = ''
    const r = await runStudioTool(
      view({ browser: browser({ open: async (u) => { opened = u; return { ok: true } } }) }),
      'browser_open',
      { url: 'studio://p/index.html' }
    )
    expect(opened).toBe('studio://p/index.html')
    expect(data(r).note).toContain('browser_set_device')
  })

  it('reports a BLOCKED url with the reason rather than silently failing', async () => {
    const r = await runStudioTool(
      view({ browser: browser({ open: async () => ({ ok: false, reason: 'needs your confirmation' }) }) }),
      'browser_open',
      { url: 'https://example.com' }
    )
    expect((r as { code: string }).code).toBe('BLOCKED')
    expect((r as { detail: string }).detail).toContain('confirmation')
  })

  it('requires a url', async () => {
    expect((await runStudioTool(view({ browser: browser() }), 'browser_open', {})).ok).toBe(false)
  })

  it('sets a device and reports what the page now believes', async () => {
    const d = data(await runStudioTool(view({ browser: browser() }), 'browser_set_device', { device: 'mobile' }))
    expect(d.w).toBe(390)
    expect(d.dpr).toBe(3)
    expect(d.touch).toBe(true)
    expect(d.note).toContain('not just a narrower window')
  })

  it('accepts a free size like 390x844', async () => {
    const r = await runStudioTool(view({ browser: browser() }), 'browser_set_device', { device: '412x915' })
    expect(r.ok).toBe(true)
  })

  it('refuses an unknown device and SUGGESTS what would work', async () => {
    const r = await runStudioTool(view({ browser: browser() }), 'browser_set_device', { device: 'nokia' })
    expect((r as { code: string }).code).toBe('NOT_FOUND')
    expect((r as { detail: string }).detail).toContain('390x844')
  })

  it('surfaces a failed device application instead of claiming success', async () => {
    const r = await runStudioTool(
      view({ browser: browser({ setDevice: async () => ({ ok: false, reason: 'close DevTools first' }) }) }),
      'browser_set_device',
      { device: 'mobile' }
    )
    expect(r.ok).toBe(false)
    expect((r as { detail: string }).detail).toContain('DevTools')
  })

  it('returns a screenshot PATH, never bytes', async () => {
    const d = data(await runStudioTool(view({ browser: browser() }), 'browser_screenshot', {}))
    expect(d.path).toContain('shot.png')
    expect(d.note).toContain('not bytes')
    expect(JSON.stringify(d)).not.toContain('base64')
  })

  it('picker_pick explains that picking is a USER gesture', async () => {
    const r = await runStudioTool(view({ browser: browser() }), 'picker_pick', {})
    expect(r.ok).toBe(false)
    expect((r as { detail: string }).detail).toContain('Pick element')
  })

  it('picker_pick returns the last capture once there is one', async () => {
    const capture = { tag: 'button', selector: '.cta' }
    const d = data(
      await runStudioTool(view({ browser: browser({ lastCapture: () => capture }) }), 'picker_pick', {})
    )
    expect(d.selector).toBe('.cta')
  })

  it('picker_import needs a page and marks the document dirty', async () => {
    let dirty = false
    expect(
      (await runStudioTool(view({ browser: browser() }), 'picker_import', {})).ok
    ).toBe(false)
    const r = await runStudioTool(
      view({ browser: browser(), markDirty: () => { dirty = true } }),
      'picker_import',
      { page: '1', x: 5, y: 6 }
    )
    expect(data(r).detail).toContain('imported')
    expect(dirty).toBe(true)
  })

  it('picker_import reports having nothing to import', async () => {
    const r = await runStudioTool(
      view({ browser: browser({ importCapture: () => ({ ok: false, detail: 'nothing has been picked' }) }) }),
      'picker_import',
      { page: '1' }
    )
    expect((r as { code: string }).code).toBe('NOT_FOUND')
  })

  it('export_bundle returns the CONTENT for main to write', async () => {
    const d = data(await runStudioTool(view(), 'studio_export_bundle', { outDir: 'C:\out' }))
    expect(d.outDir).toBe('C:\out')
    expect(d.files.some((f: { path: string }) => f.path === 'README.md')).toBe(true)
    expect(d.files.some((f: { path: string }) => f.path === 'manifest.json')).toBe(true)
    expect(d.note).toContain('README.md')
  })

  it('export_bundle still refuses without an outDir', async () => {
    expect((await runStudioTool(view(), 'studio_export_bundle', {})).ok).toBe(false)
  })
})

describe('an unknown tool', () => {
  it('is reported, not ignored', async () => {
    const r = await runStudioTool(view(), 'made_up', {})
    expect((r as { code: string }).code).toBe('NOT_FOUND')
  })
})
