// The icon panel: a preset picker, a live preview strip, the pixel-fit
// validator, and the export row.
//
// WHY THE PREVIEW STRIP IS THE FEATURE, not decoration: an icon is the one
// drawing whose final size is decided by somebody else. Drawing at 24 and
// shipping at 16 is the normal case, and the difference between a crisp glyph
// and a soft one is invisible at authoring size. The strip renders the same
// artwork at every target size on every commit, so the failure is visible
// while it is still cheap to fix.
//
// The validator does the half of that the eye cannot: it names the node that
// is off the pixel grid, at which size, and by how much.

import { t } from '../i18n/i18n'
import type { Shape } from '../design/shapes'
import { toSvg, ICO_SIZES, type IconPath } from './icon/export'
import { PRESETS, keylineShapes, liveArea, presetById, type IconPreset } from './icon/presets'
import { integerScaleSizes, snapToPixelGrid, validateIcon } from './icon/validate'
import { shiftPathD } from '../design/path'

/** The bundled library, as it sits on disk. */
interface IconLibrary {
  source: string
  license: string
  grid: number
  strokeWidth: number
  pinned: number
  icons: Array<{ name: string; paths: Array<{ d: string; strokeWidth: number }> }>
}

export interface IconPanelHost {
  /** The path shapes on the current artboard, in canvas pt. */
  iconPaths(): Shape[]
  /** Replace one shape's geometry (used by the snap fix). */
  updatePathD(id: string, d: string): void
  /** Turn the current artboard into an icon canvas of this preset. */
  makeIconArtboard(preset: IconPreset): void
  /** The preset the current artboard already uses, if any. */
  currentPreset(): IconPreset | null
  saveFile(name: string, bytes: Uint8Array): void
  setStatus(message: string): void
  /** Draw or clear the keyline guides on the canvas. */
  showGuides(guides: ReturnType<typeof keylineShapes>, live: ReturnType<typeof liveArea> | null): void
  /** Place a library icon's paths on the current artboard. */
  insertIcon(name: string, paths: Array<{ d: string; strokeWidth: number }>, grid: number): void
}

/** Sizes the strip renders. Small first, because that is where icons fail. */
const STRIP = [16, 24, 32, 48, 128]

export class IconPanel {
  private root: HTMLElement
  private strip: HTMLElement
  private report: HTMLElement
  private presetSel: HTMLSelectElement
  private search!: HTMLInputElement
  private libraryEl!: HTMLElement
  /**
   * 5,425 icons is 4.4 MB of JSON. Bundling it eagerly would put it in the
   * design module's chunk and make every document pay for a panel most never
   * open, so it is fetched on the first render of this tab and cached here.
   */
  private library: IconLibrary | null = null
  private libTitle!: HTMLElement
  private guidesOn = true
  private preset: IconPreset

  constructor(
    parent: HTMLElement,
    private readonly host: IconPanelHost
  ) {
    this.preset = host.currentPreset() ?? PRESETS[0]

    this.root = document.createElement('section')
    this.root.className = 'dz-iconpanel'

    const title = document.createElement('h3')
    title.textContent = t('studioIcons')
    this.root.append(title)

    const row = document.createElement('div')
    row.className = 'dz-cp-row'
    this.presetSel = document.createElement('select')
    for (const p of PRESETS) {
      const o = document.createElement('option')
      o.value = p.id
      o.textContent = `${p.label} · ${p.grid}pt`
      this.presetSel.append(o)
    }
    this.presetSel.value = this.preset.id
    this.presetSel.addEventListener('change', () => {
      this.preset = presetById(this.presetSel.value)
      this.host.makeIconArtboard(this.preset)
      this.syncGuides()
      this.refresh()
    })
    row.append(this.presetSel)
    row.append(this.button(t('studioIconNew'), () => {
      this.host.makeIconArtboard(this.preset)
      this.syncGuides()
      this.refresh()
    }))
    this.root.append(row)

    const toggles = document.createElement('div')
    toggles.className = 'dz-cp-actions'
    const guides = this.button(t('studioIconGuides'), () => {
      this.guidesOn = !this.guidesOn
      guides.classList.toggle('active', this.guidesOn)
      this.syncGuides()
    })
    guides.classList.add('active')
    toggles.append(guides)
    toggles.append(this.button(t('studioIconSnap'), () => this.snapAll()))
    this.root.append(toggles)

    this.strip = document.createElement('div')
    this.strip.className = 'dz-icon-strip'
    this.root.append(this.strip)

    this.report = document.createElement('div')
    this.report.className = 'dz-icon-report'
    this.root.append(this.report)

    // The bundled library. Provenance is shown, not buried: these are somebody
    // else's drawings and the user should be able to see whose and under what
    // licence without opening a file.
    this.libTitle = document.createElement('div')
    this.libTitle.className = 'dz-icon-note'
    this.libTitle.textContent = t('studioIconLoading')
    this.root.append(this.libTitle)

    this.search = document.createElement('input')
    this.search.type = 'search'
    this.search.className = 'dz-cp-hex'
    this.search.placeholder = t('studioIconSearch')
    this.search.addEventListener('input', () => this.renderLibrary())
    this.root.append(this.search)

    this.libraryEl = document.createElement('div')
    this.libraryEl.className = 'dz-icon-library'
    this.root.append(this.libraryEl)
    void this.loadLibrary()

    const exports = document.createElement('div')
    exports.className = 'dz-cp-actions'
    exports.append(this.button('SVG', () => this.exportSvg()))
    exports.append(this.button('PNG', () => void this.exportPngs()))
    exports.append(this.button('ICO', () => void this.exportIco()))
    this.root.append(exports)

    parent.append(this.root)
    this.syncGuides()
    this.refresh()
  }

  destroy(): void {
    this.host.showGuides([], null)
    this.root.remove()
  }

  private button(label: string, run: () => void): HTMLElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dz-btn'
    b.textContent = label
    b.addEventListener('click', run)
    return b
  }

  private syncGuides(): void {
    // The keyline box describes an ICON ARTBOARD — where the glyph may sit
    // inside a 24pt canvas. On an ordinary page it is a small dashed square
    // pinned to the origin, belonging to nothing the user can select, move or
    // delete. That is how it gets reported: a leftover mark near the corner.
    //
    // The panel opens on PRESETS[0] when the page is not an icon canvas, so
    // this cannot be inferred from the preset alone — the page has to be asked.
    const on = this.guidesOn && !!this.host.currentPreset()
    this.host.showGuides(on ? keylineShapes(this.preset) : [], on ? liveArea(this.preset) : null)
  }

  /** Re-render the strip and the report. Called on every commit. */
  refresh(): void {
    const paths = this.host.iconPaths().filter((s) => s.kind === 'path' && s.d)
    this.renderStrip(paths)
    this.renderReport(paths)
  }

  private asIconPaths(shapes: Shape[]): IconPath[] {
    return shapes.map((s) => ({
      // `d` is local to the shape, so it is shifted onto the icon canvas by
      // the shape's own origin — the strip must show what the artboard shows.
      d: shiftPathD(s.d ?? '', s.x, s.y),
      fill: s.fill || undefined,
      stroke: s.stroke || undefined,
      strokeWidth: s.strokeWidth
    }))
  }

  private renderStrip(shapes: Shape[]): void {
    this.strip.innerHTML = ''
    if (!shapes.length) {
      const empty = document.createElement('div')
      empty.className = 'dz-icon-empty'
      empty.textContent = t('studioIconEmpty')
      this.strip.append(empty)
      return
    }
    const svg = toSvg(this.asIconPaths(shapes), this.preset)
    // A data URL rather than an <img src=blob>: no object URL to revoke, and
    // the strip is rebuilt often enough that a leaked blob would accumulate.
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    for (const size of STRIP) {
      const cell = document.createElement('div')
      cell.className = 'dz-icon-cell'
      const img = document.createElement('img')
      img.src = src
      img.width = size
      img.height = size
      img.alt = ''
      const label = document.createElement('span')
      label.textContent = String(size)
      label.dir = 'ltr'
      cell.append(img, label)
      this.strip.append(cell)
    }
  }

  private renderReport(shapes: Shape[]): void {
    this.report.innerHTML = ''
    if (!shapes.length) return
    const r = validateIcon(
      this.asIconPaths(shapes).map((p) => ({ d: p.d, strokeWidth: p.strokeWidth })),
      this.preset
    )
    const light = document.createElement('div')
    light.className = `dz-icon-light ${r.ok ? 'ok' : 'warn'}`
    light.textContent = r.ok ? t('studioIconCrisp') : t('studioIconSoft')
    this.report.append(light)

    // Naming which sizes CAN be crisp is the difference between an actionable
    // warning and a red light nobody can ever clear: a 24-grid glyph is only
    // pixel-perfect at integer multiples of its grid, so flagging 16 and 20
    // would be flagging arithmetic.
    const reach = document.createElement('div')
    reach.className = 'dz-icon-note'
    reach.textContent = t('studioIconReach').replace(
      '{sizes}',
      integerScaleSizes(this.preset).join(', ')
    )
    this.report.append(reach)

    if (r.outsideLiveArea) {
      this.report.append(this.note(t('studioIconOutside')))
    }
    if (r.tooSmall) {
      this.report.append(this.note(t('studioIconSmall')))
    }
    for (const size of r.sizes) {
      if (size.ok || !r.crispSizes.includes(size.size)) continue
      this.report.append(
        this.note(
          t('studioIconOff')
            .replace('{n}', String(size.offenders.length))
            .replace('{size}', String(size.size))
        )
      )
    }
  }

  /**
   * The searchable library grid.
   *
   * Capped at 60 results: the panel is 260px wide, and a grid of 132 tiny
   * glyphs is a wall rather than a chooser. The cap is stated in the status
   * line when it bites, because a silently truncated list is a list that lies.
   */
  /** Fetch the library once, on first use. */
  private async loadLibrary(): Promise<void> {
    try {
      const mod = await import('../../resources/icons/hugeicons.json')
      this.library = (mod.default ?? mod) as unknown as IconLibrary
    } catch {
      // A missing library is a build problem, not a user error — say so rather
      // than showing an empty grid that looks like "no icons exist".
      this.libTitle.textContent = t('studioIconLibraryMissing')
      return
    }
    this.libTitle.textContent = t('studioIconLibrary')
      .replace('{n}', String(this.library.icons.length))
      .replace('{license}', this.library.license)
    this.renderLibrary()
  }

  private renderLibrary(): void {
    this.libraryEl.innerHTML = ''
    const library = this.library
    if (!library) return
    const q = this.search.value.trim().toLowerCase()
    // With no query the PINNED head is shown — the hand-picked marks a UI tool
    // reaches for. Searching drops the pin and goes over the whole library.
    const pool = q ? library.icons : library.icons.slice(0, library.pinned)
    const all = pool.filter((i) => !q || i.name.toLowerCase().includes(q))
    const shown = all.slice(0, 60)
    for (const icon of shown) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-icon-tile'
      b.title = icon.name
      const body = icon.paths
        .map(
          (p) =>
            `<path d="${p.d}" fill="none" stroke="currentColor" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
        )
        .join('')
      b.innerHTML = `<svg viewBox="0 0 ${library.grid} ${library.grid}" width="20" height="20">${body}</svg>`
      b.addEventListener('click', () => {
        this.host.insertIcon(icon.name, icon.paths, library.grid)
        this.refresh()
      })
      this.libraryEl.append(b)
    }
    if (all.length > shown.length) {
      this.libraryEl.append(
        this.note(t('studioIconMore').replace('{n}', String(all.length - shown.length)))
      )
    } else if (!q && library.icons.length > library.pinned) {
      // Say that the rest exists. A picker that shows 132 of 5,425 without
      // saying so reads as "that is all there is".
      this.libraryEl.append(
        this.note(t('studioIconSearchAll').replace('{n}', String(library.icons.length)))
      )
    }
    if (!all.length) this.libraryEl.append(this.note(t('studioIconNoMatch')))
  }

  private note(text: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'dz-icon-note'
    el.textContent = text
    return el
  }

  /**
   * Snap every path to the grid of the SMALLEST reachable size.
   *
   * Offered, never automatic: snapping for 16px moves nodes that were placed
   * to look right at 48, so the choice of which size wins is the user's.
   */
  private snapAll(): void {
    const sizes = integerScaleSizes(this.preset)
    const target = sizes[0] ?? this.preset.grid
    let changed = 0
    for (const s of this.host.iconPaths()) {
      if (s.kind !== 'path' || !s.d) continue
      const out = snapToPixelGrid(s.d, this.preset, target, s.strokeWidth)
      if (out !== s.d) {
        this.host.updatePathD(s.id, out)
        changed++
      }
    }
    this.host.setStatus(
      changed
        ? t('studioIconSnapped').replace('{n}', String(changed)).replace('{size}', String(target))
        : t('studioIconAlready')
    )
    this.refresh()
  }

  private exportSvg(): void {
    const shapes = this.host.iconPaths().filter((s) => s.kind === 'path' && s.d)
    if (!shapes.length) return
    // currentColor by default: an icon that hardcodes its fill cannot follow
    // the text colour where it is used, which is what an icon set is for.
    const svg = toSvg(this.asIconPaths(shapes), this.preset, { currentColor: true })
    this.host.saveFile('icon.svg', new TextEncoder().encode(svg))
  }

  /** Rasterise the icon at one size, via the same SVG the export writes. */
  private async raster(size: number): Promise<Uint8Array | null> {
    const shapes = this.host.iconPaths().filter((s) => s.kind === 'path' && s.d)
    if (!shapes.length) return null
    const svg = toSvg(this.asIconPaths(shapes), this.preset)
    const img = new Image()
    img.width = size
    img.height = size
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = src
    })
    if (!loaded) return null
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  }

  private async exportPngs(): Promise<void> {
    for (const size of [1, 2, 3]) {
      const px = this.preset.grid * size
      const bytes = await this.raster(px)
      if (bytes) this.host.saveFile(`icon@${size}x.png`, bytes)
    }
  }

  private async exportIco(): Promise<void> {
    const entries: Array<{ size: number; bytes: Uint8Array }> = []
    for (const size of ICO_SIZES) {
      const bytes = await this.raster(size)
      if (bytes) entries.push({ size, bytes })
    }
    if (!entries.length) return
    const { toIco } = await import('./icon/export')
    this.host.saveFile('icon.ico', toIco(entries))
  }
}
