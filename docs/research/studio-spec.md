All packages verified against the live npm registry. Writing the spec.

---

# EXELMJ STUDIO — Architecture Specification
## Extending the design page into a UI design studio

**Status:** proposal, awaiting approval. No code written.
**Verified against:** `D:\EXELMJ` @ v0.3.0, Electron 43.1.1, Vite 8.1.5, vanilla TS; `E:\exten Picker` @ manifest v3.2.0.
**Every package named below was resolved against the live npm registry during this session.** Versions and licences are quoted from that lookup, not from memory.

---

## 0. WHAT I FOUND IN THE CODE (corrections to the brief)

Three assumptions in the brief are wrong in our favour, and one is worse than stated. They change the plan, so they come first.

| Brief said | Code says | Consequence |
|---|---|---|
| "no crop UI" | `PlacedImage.crop{l,t,r,b}` **already exists**, `cropRectPx()` and `paintImage()` already honour it (`images.ts:63-71`, `:104-112`) | Crop is a **UI-only** milestone. The model, the painter and the PDF path are done. Roughly a day, not a week. |
| "traced paths cannot be re-coloured" | `Shape.gradient` already exists and `paintShape` already renders a linear gradient on a traced path (`shapes.ts:181-190`) | The blocker is not the model. It is that a traced path is one opaque `d` blob with no sub-region identity. Fixed by normalisation + subpath splitting, not by a model change. |
| trace.ts is a monolith | `buildPalette()`, `refinePalette()`, `nearestIndex()` are **already exported** (`trace.ts:212, 444, 273`) | "Extract a palette from an image" is a ~40-line reuse of code we own. No quantisation library needed. Ever. |
| `<webview>` for the embedded browser | Electron's own docs now say: *"We currently recommend to not use the `webview` tag and to consider alternatives, like `iframe`, a `WebContentsView`…"* Verified live. `WebContentsView` **is** present in `node_modules/electron/electron.d.ts` @ 43.1.1. | The embedded browser must be a main-process `WebContentsView`, not a renderer `<webview>`. This is *better*: CDP is main-process-only anyway, so both halves now live on the same side of the IPC boundary. |

And the one that is worse:

**The Element Picker does not export geometry.** I read `componentJson()` (`sidepanel.js:994-1067`). It exports `html`, `css`, `tailwind`, `baseRules`, `stateRules`, `stateKeyframes`, `motion`, `text`, `labels`, `context`, `behavior`, and exactly one number pair: `size:{w,h}` for the **whole component** (`content.js:6453`). There is no per-node box anywhere in the payload.

So the bridge cannot be a translator. **It must be a layout engine run.** That single fact determines section 3.

---

## 1. THE SHARED DOCUMENT MODEL

### 1.1 Decision: bump to `version: 4` and extend. No sibling document type.

### 1.2 Defence

A sibling type (`StudioProject` alongside `DesignProject`) would need its own path convention, its own loader, its own save path, its own undo serialiser, its own exporter set, and a rule for what happens when a user draws a rectangle on a "studio" document. `designApp.ts` is 3,102 lines built around exactly one document; forking it produces two editors in one window — the same mistake I would reject `@svgedit/svgcanvas` for.

More decisively: **the four artefacts in the brief are the same artefact.** A hand-drawn design, an icon, a UI screen and a captured component are all *"a set of shapes, texts and images positioned in points on a page."* An icon is a page that is 24×24 pt with a keyline overlay. A UI screen is a page with layout constraints on some of its groups. A captured component is a screen we did not draw ourselves. Modelling them separately would mean writing the same renderer four times.

### 1.3 The extension mechanism: a side-table, not a tree

The single most important structural decision. **Do not convert `shapes`/`images`/`pages` into a node tree.** Every renderer, hit-test, exporter (`pdfOverlayExport.ts`, `svgDesign.ts`, `wordExport.ts`) and the undo snapshot (`captureState()` serialises exactly `{boxes, shapes, images}`) iterates flat arrays. Rewriting that is a full-file rewrite with no visible feature at the end.

Instead: **hierarchy is a side-table that references leaf ids.** A `Frame` owns `children: string[]`. Leaves stay in the flat arrays. Paint order stays array order. Code that does not know about frames still draws a correct picture — it just draws it without layout. That is the property that makes this migration cheap and makes every intermediate build shippable.

### 1.4 The type sketch

```ts
// src/studio/model.ts  — additive to src/design/overlayModel.ts

// ============================================================
// A. THE ENVELOPE
// ============================================================

export interface DesignProject {
  version: 4                       // was 3
  source: string                   // unchanged
  pages: PageBoxes                 // unchanged — TextBox[] per page
  shapes: PageShapes               // unchanged shape, EXTENDED fields (§1.5)
  images: PageImages               // unchanged
  studio?: StudioDoc               // v4, additive, absent on legacy files
}

export interface StudioDoc {
  schema: 'exelmj-studio/1'
  /** pageId -> frames. Frames reference leaves by id; they do not contain them. */
  frames: Record<string, Frame[]>
  /** pageId -> component instances placed on that page. */
  instances: Record<string, ComponentInstance[]>
  /** Page-level identity: an artboard is a device preset, an icon canvas, or free. */
  pageKind: Record<string, PageKind>
  /** The design system. One per document. */
  tokens: TokenSet
  /** Reusable definitions: templates, captured components, icons. */
  components: ComponentDef[]
  /** Icon-specific metadata keyed by the frame id that holds the icon. */
  icons: Record<string, IconMeta>
  /** Provenance for anything imported from a live site. */
  captures: CaptureRecord[]
}

// ============================================================
// B. PAINT — the literal-or-alias indirection
// ============================================================
// Every existing colour field stays a plain "#RRGGBB" string and stays
// AUTHORITATIVE for rendering. A token alias is an OPTIONAL sibling field
// holding the reference plus a resolved cache. Nothing that renders today
// needs to learn about tokens; nothing that reads a token needs to re-render.
// This is Figma's `boundVariables` shape, minus its node-type explosion.

export type TokenRef = string          // dot path, e.g. 'color.brand.600'

export interface PaintRef {
  /** Token path. When present, `fill`/`stroke` on the shape is a CACHE of it. */
  ref: TokenRef
  /** ISO timestamp of the last resolve; a stale cache is repaired on open. */
  at: string
}

export type Paint =
  | { kind: 'solid'; color: string; alpha?: number }
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradStop[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: GradStop[] }
  | { kind: 'image'; src: string; fit: 'cover' | 'contain' | 'fill'; crop?: Crop }

export interface GradStop { at: number; color: string; alpha?: number }
export interface Crop { l: number; t: number; r: number; b: number }

// ============================================================
// C. SHAPE — extended in place (see §1.5 for the compatibility rules)
// ============================================================

export interface ShapeV4 extends Shape {          // Shape from src/design/shapes.ts
  /** degrees clockwise about the bbox centre. Absent === 0. */
  rotation?: number
  /** 0..1. Absent === 1. */
  opacity?: number
  /** rect only: per-corner radius in pt, [tl,tr,br,bl]. Absent === square. */
  radius?: [number, number, number, number]
  /** Rich paint. When present it WINS over `fill`; `fill` holds a flat
   *  approximation so legacy exporters still produce something sane. */
  fillPaint?: Paint
  strokePaint?: Paint
  /** Token bindings. */
  fillRef?: PaintRef
  strokeRef?: PaintRef
  strokeWidthRef?: PaintRef
  /** Stroke geometry, needed for icon work. Absent === butt/miter/centre. */
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
  /** 'center' is the Lucide convention; 'inside'/'outside' need offsetting. */
  align?: 'center' | 'inside' | 'outside'
  /** fill rule. Absent === 'evenodd' (what paintShape hardcodes today). */
  rule?: 'nonzero' | 'evenodd'
  /** Set by the picker bridge. Which DOM node produced this shape. */
  origin?: OriginRef
  /** Parent frame id, mirrored from Frame.children for O(1) lookup.
   *  Frame.children remains the source of truth; this is a derived index
   *  rebuilt on load, never trusted from disk. */
  frame?: string
}

// ============================================================
// D. FRAME — hierarchy + auto-layout
// ============================================================

export interface Frame {
  id: string
  name: string
  /** Absolute pt from page top-left, same contract as everything else. */
  x: number; y: number; w: number; h: number
  rotation?: number
  /** Leaf ids (Shape.id | TextBox.id | PlacedImage.id) AND nested Frame ids.
   *  Order here is LAYOUT order. Paint order remains the flat array order. */
  children: string[]
  /** null = free positioning (a plain group / artboard). */
  layout: AutoLayout | null
  clip?: boolean
  fillPaint?: Paint
  fillRef?: PaintRef
  radius?: [number, number, number, number]
  /** 'icon' frames get the keyline overlay and the pixel-grid validator. */
  kind?: 'group' | 'artboard' | 'icon' | 'component-root'
}

export interface AutoLayout {
  mode: 'flex' | 'grid'
  direction: 'row' | 'column'
  /** Arabic-first: 'auto' means follow the document direction. */
  dir: 'ltr' | 'rtl' | 'auto'
  wrap: boolean
  gap: number                      // pt
  gapCross?: number                // pt, grid only
  padding: [number, number, number, number]   // t,r,b,l in pt
  /** CSS names on purpose — these map 1:1 onto the engine (§2d). */
  justify: 'start' | 'center' | 'end' | 'space-between' | 'space-around'
  align: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
  /** Per-axis sizing of the FRAME ITSELF. */
  sizing: { w: SizeMode; h: SizeMode }
  /** grid only. */
  cols?: TrackSpec[]
  rows?: TrackSpec[]
}

export type SizeMode = 'fixed' | 'hug' | 'fill'
export type TrackSpec =
  | { kind: 'fixed'; pt: number }
  | { kind: 'fr'; n: number }
  | { kind: 'auto' }

/** Per-CHILD overrides, stored on the frame so leaves stay untouched. */
export interface LayoutChild {
  id: string
  grow?: number
  shrink?: number
  basis?: SizeMode
  alignSelf?: AutoLayout['align']
  /** free-position children of a layout frame: pinned, not flowed. */
  absolute?: boolean
  /** constraints used when the parent is NOT a layout frame */
  pin?: { l?: boolean; r?: boolean; t?: boolean; b?: boolean }
}

// ============================================================
// E. TOKENS — DTCG-SHAPED (we say "DTCG-inspired", we do not claim conformance)
// ============================================================

export interface TokenSet {
  /** DTCG group tree. $-prefixed keys are metadata; everything else is a group. */
  root: TokenGroup
  /** Named themes are OVERLAYS: a sparse map of path -> value. */
  themes: Record<string, Record<TokenRef, TokenValue>>
  activeTheme: string              // 'light' by default
}

export interface TokenGroup {
  $description?: string
  $type?: TokenType
  [key: string]: TokenGroup | Token | string | undefined
}

export interface Token {
  $value: TokenValue
  $type?: TokenType
  $description?: string
  /** EXELMJ extension, namespaced so a DTCG consumer ignores it. */
  $extensions?: {
    'com.exelmj.studio'?: {
      /** the OKLCH triple this hex was authored as — hex is the lossy cache */
      oklch?: [number, number, number]
      /** which scale + step produced it, so regeneration is possible */
      scale?: { seed: TokenRef; step: number }
      locked?: boolean
    }
  }
}

export type TokenType =
  | 'color' | 'dimension' | 'number' | 'fontFamily' | 'fontWeight'
  | 'duration' | 'cubicBezier' | 'shadow' | 'border' | 'typography' | 'gradient'

/** '{color.brand.600}' is a DTCG alias; anything else is a literal. */
export type TokenValue = string | number | Record<string, unknown>

// ============================================================
// F. COMPONENTS, TEMPLATES, ICONS — one shape for all three
// ============================================================
// shadcn's registry-item lesson: only `name` and `type` required, one
// extensible type enum, payload carried INLINE so a single JSON file is a
// valid, self-contained item.

export interface ComponentDef {
  name: string                       // unique within the document
  type: 'component' | 'template' | 'icon' | 'theme' | 'page'
  title?: string
  description?: string
  /** Other ComponentDef names this one composes. */
  dependencies?: string[]
  /** The payload: a self-contained mini-document in LOCAL pt (0,0 = top-left). */
  content: {
    w: number; h: number
    frames: Frame[]
    shapes: ShapeV4[]
    boxes: TextBox[]
    images: PlacedImage[]
  }
  /** Fields an instance may override. Path is 'shapeId.field' or 'boxId.text'. */
  slots?: Slot[]
  /** data URL, PNG, <= 256px. Rendered once at authoring time. */
  preview?: string
  meta?: { author?: string; created: string; tags?: string[]; source?: string }
}

export interface Slot {
  path: string                       // 'title.text' | 'avatar.src' | 'bg.fillRef'
  label: string
  type: 'text' | 'image' | 'color' | 'number' | 'boolean'
  default?: unknown
}

export interface ComponentInstance {
  id: string
  def: string                        // ComponentDef.name
  x: number; y: number
  w?: number; h?: number             // absent = def's intrinsic size
  rotation?: number
  overrides: Record<string, unknown> // keyed by Slot.path
  /** true = user broke the link; the leaves were expanded into the page. */
  detached?: boolean
}

export interface IconMeta {
  grid: 16 | 20 | 24 | 32 | 48
  preset: 'material' | 'lucide' | 'octicons' | 'custom'
  liveArea: number                   // pt, e.g. 20 on a 24 grid
  strokeWidth: number
  keylines: boolean
  /** Sizes the pixel-grid validator checks against. */
  targets: number[]                  // e.g. [16, 24, 32, 48]
}

// ============================================================
// G. PROVENANCE — the picker bridge writes this
// ============================================================

export interface CaptureRecord {
  id: string
  url: string
  selector: string
  capturedAt: string
  /** picker component name + kind, verbatim from componentJson() */
  picker: { name: string; kind: string; kindLabel?: string }
  /** Everything the picker sent, kept verbatim so a re-import is lossless. */
  raw: { html: string; css: string; tailwind: string | null }
  /** SHA-256 of raw, so we can tell a re-capture from a re-import. */
  hash: string
  /** What we could NOT reproduce. Shown to the user; shipped in the ZIP. */
  unsupported: string[]
}

export interface OriginRef {
  capture: string                    // CaptureRecord.id
  /** nth-child path inside the captured subtree */
  path: string
  role?: string                      // resolved ARIA role
  name?: string                      // accessible name
  /** which CSS layer of that element this shape represents */
  layer: 'background' | 'border' | 'shadow' | 'text' | 'content' | 'raster'
}

export type PageKind =
  | { kind: 'free' }
  | { kind: 'device'; preset: string; w: number; h: number; dpr: number }
  | { kind: 'icon'; grid: number }
```

### 1.5 Migration consequences — stated plainly

**Forward (v3 → v4): safe and silent.**
`parseProject()` gains `raw.version === 4` to the existing `(2 || 3)` branch. A v3 file loads, `studio` is absent, `pageKind` defaults to `{kind:'free'}` per page, and the document behaves exactly as today. No user action.

**Extended `Shape` fields: additive, but `cleanShape()` must be edited.**
`cleanShape()` (`shapes.ts:130-166`) *constructs* its return object field-by-field, so it silently **drops** anything it does not know. That is a security property we keep. Every new field gets an explicit validated line. Missing = the current default. A v3 shape gains `rotation:undefined` (≡ 0), `rule:undefined` (≡ `'evenodd'`, matching the hardcoded `ctx.fill(p,'evenodd')`). **Zero visual change on any existing file** — this is testable and is a success criterion in M1.

**Backward (v4 → old build): the sidecar is silently ignored.**
This is real and must be said. `parseProject()` in v0.3.0 tests `raw?.version === 2 || raw?.version === 3` strictly and returns `null` otherwise. `null` means the design page loads the artwork with **no overlay at all** — every text box, shape and image invisible. Not corrupted; not saved over unless the user then saves.

Three mitigations, all cheap:

1. **On the first v4 save of a document that was loaded as v3, also write `<file>.exelmj.v3.json`** — the v3 projection (pages/shapes/images only, frames flattened to absolute geometry). One extra `writeFileSilent`. A user who rolls back renames one file.
2. **Never write v4 unless the document actually uses a v4 feature.** `serializeProject()` emits `version:3` when `studio` is empty and no shape carries a v4 field. Most existing documents never become v4 at all.
3. **The lossy-downgrade rule:** the v3 projection is *geometry-complete and system-blind*. Frames become nothing (children keep their absolute boxes, which are already correct). Instances are expanded to leaves. Token refs collapse to their cached hex. `fillPaint` gradients collapse to the existing `Shape.gradient` when linear, else to `stops[0].color`. Nothing moves; only the *system* is lost.

**Rejected alternative — "stay at version 3, hide everything under a new `studio` key."**
Old builds would then load the file *and re-save it without `studio`*, silently destroying the entire design system on a round trip. A version bump that makes an old build refuse to load is strictly safer than one that makes it load and quietly delete. **Loud failure beats silent data loss.**

---

## 2. THE FOUR NEW TOOL GROUPS

Common shell: a right-hand **Studio panel** with four stacked, collapsible sections (Icons / Colours / Templates / Layout), plus the existing layers panel. RTL: the panel docks *left* when `lang==='ar'`, mirroring `rtlMirror.ts`'s existing convention.

---

### (a) ICONS

**What the user sees**

- Toolbar: `Icon ▾` → *New icon artboard* → size picker (16 / 20 / 24 / 32 / 48) + preset (Material / Lucide / Octicons / Custom).
- The page becomes a fixed square artboard with three overlay layers, each independently toggleable:
  - **pixel grid** — 1 pt = 1 px at grid size;
  - **live area** — the inset rectangle (Material: 20 dp inside 24, i.e. 2 dp padding per side);
  - **keylines** — Material's four reference shapes drawn as non-printing guides: 18×18 square, ⌀20 circle, 20h×16w and 16h×20w rectangles.
- A **preview strip** pinned to the panel bottom, re-rendering the artboard at 16/24/32/48/128 px on every commit (Inkscape's Icon Preview dialog, which is the feature that turns *drawing a shape* into *authoring an icon*).
- A **validator light** per target size: green when every stroke edge and every path node lands on a whole pixel at that size, amber otherwise, with the offending node listed.
- **Icon library browser**: search over the bundled offline Iconify subset; click to insert as editable paths.
- Export row: `SVG` · `PNG @1x @2x @3x` · `ICO` · `ICNS` · `Icon font (TTF)`.

**Presets, as a constants file — this is free data, not code**

| | Material | Lucide | Octicons |
|---|---|---|---|
| canvas | 24 dp (dense 20) | 24 | 16 **and** 24 (both, always) |
| live area | 20 dp (dense 16) | ≥1 px padding | — |
| stroke | 2 dp (1.5 permitted when multiple curves must fit) | 2 | 1.5 at **both** sizes |
| corner radius | 2 dp exterior, **interior corners square** | 2 | 1, and 0.25 on small filled arrowheads |
| cap / join | — | round / round | round / round |
| alignment | — | centered | — |
| spacing | — | 2 between elements | 1 gap for overlap, 1.5 around modifiers |
| precision | — | 3 decimals | — |

**What it writes into the model**

A `Frame{kind:'icon'}` sized to the grid, with `IconMeta` in `studio.icons[frameId]`. Contents are ordinary `ShapeV4` — `kind:'path'`, `d` in local pt, plus `cap`/`join`/`align`/`rule`. Nothing icon-specific leaks into the leaf types, so an icon is exportable by the SVG/PDF paths we already have.

**Implementation**

| Job | How |
|---|---|
| Path normalisation (**the choke point**) | `svgpath@2.6.0` (MIT, zero deps — verified). Every path entering the app — tracer output, Iconify `body`, picker capture, pasted SVG — goes through `.unarc().unshort().abs().round(3)`. The node editor then only ever handles **M / L / C / Z absolute**. This is what unblocks "traced paths cannot be node-edited". |
| Stroke → outline | `bezier-js@6.1.4` (MIT, zero deps — verified). `reduce() → scale() → outline()`. Curve-native, so a 1.5 pt Octicon stroke survives becoming a filled shape. |
| **Forbidden** | `oslllo/svg-fixer` and `svg-outline-stroke` are **banned in the ADR**. Both rasterise then potrace; `svg-outline-stroke` additionally exact-pins `sharp@0.28.1`, which will not build on Electron 43. A 1.5 px stroke rasterised at 16 px and re-traced returns as garbage. |
| Deterministic preview strip & PNG export | `@resvg/resvg-wasm@2.6.2` (MPL-2.0, portable WASM — verified). The WASM build specifically: no native rebuild, no per-platform prebuild. Also lets us point at explicit **font files** and disable system font loading, which is how Arabic rendering becomes reproducible instead of machine-dependent. |
| ICO / ICNS | `png2icons@2.0.1` (MIT). **Verified: zero dependencies.** Every other ICO generator pulls `sharp` or `jimp`. Runs in-process, so "export as app icon" is a button. |
| Icon font | `opentype.js@2.0.0` (MIT). **Verified: zero dependencies** — a correction to the sweep, which claimed `tiny-inflate`. Because it *writes* fonts, we build a TTF in the renderer with no `svg2ttf`/`ttf2woff2`/native build. PUA codepoints from `0xEA01`, `${unicode}-${name}.svg` override — svgicons2svgfont's contract, copied, not installed. |
| Export cleanup | `svgo@4.0.2`, imported as `svgo/browser` (**verified**: `exports['./browser'] → dist/svgo.browser.js`). v4 disables `removeViewBox`/`removeTitle` by default, which is exactly what an icon tool wants — no config needed. |
| Offline icon library | `@iconify/json@2.2.516` (package MIT; **icons are per-set**). Build-time only, tree-picked. |
| Snapping | Hand-rolled. Snap targets: pixel grid at the current target size, live-area edges, keyline shapes, sibling edges/centres, and `rbush` neighbours. |

**The Iconify licence gate — non-negotiable, and it is a build script, not a decision**

`scripts/pick-icons.mjs` reads `node_modules/@iconify/json/collections.md` **programmatically**, whitelists only `MIT | Apache-2.0 | ISC | BSD-* | Unlicense | CC0`, and **fails the build** on anything else. This automatically excludes Gridicons (GPL-2.0), Typicons (CC BY-SA 4.0) and the Solar/coolicons CC-BY family, while keeping Tabler (6,184, MIT) and Material Symbols (15,585, Apache-2.0). It must be programmatic because hand-copied licence tables are already known to be wrong — the candidate research called Remix Icon MIT; `collections.md` says Apache-2.0. Output: `resources/icons/*.json`, a few MB, not the 200 MB package.

**Import lint (Lucide's validator rule, reimplemented)**
Reject or flatten any imported icon carrying `transform`, `filter`, `fill` or an explicit `stroke`. That single rule is what keeps the library re-colourable and node-editable forever.

---

### (b) COLOURS

**What the user sees**

- **Palette panel**: swatch grid grouped by DTCG path. Each swatch shows its name, its resolved hex, and a token chip when bound.
- **Colour editor**: a hand-rolled OKLCH picker on canvas — L·C plane for the current hue, H strip beneath, alpha strip. **The sRGB gamut boundary is drawn as a live curve on the L·C plane**, so a colour can never be dragged out of gamut. Numeric fields for OKLCH / hex / RGB.
- **"Generate scale from this colour"**: seed + background → a 12-step scale.
- **"Extract from image"**: pick any `PlacedImage` or the page background → N swatches with role names.
- **Contrast readout**: pairwise ratio + verdict badge (`AAA` / `AA` / `AA Large` / `Fail`) — a verdict, never a bare number.
- **"Solve for contrast"**: state the target (e.g. 4.5:1 on `color.bg.default`), keep hue and chroma, and the tool solves for lightness.
- **Dark mode**: one button derives a `dark` theme overlay; every derived token is editable and individually lockable.
- **CVD preview**: protanopia / deuteranopia / tritanopia / achromatopsia + `-anomaly` partials, with a 0–100 % severity slider.
- Export row: `.tokens.json` (DTCG) · `CSS variables` · `.ase` (Adobe Swatch Exchange).

**What it writes**

`studio.tokens`. Every shape/text/frame colour field gains an optional `*Ref` binding; the plain hex stays as the resolved cache so nothing that renders needs to know tokens exist.

**Implementation**

| Job | How |
|---|---|
| Parse / convert / interpolate / ΔE | `culori@4.0.2` (MIT, **verified zero runtime deps**). **The single colour parser in the app.** A second general-purpose colour library is banned in the ADR — two parsers means two rounding behaviours and the same hex rendering differently in two panels. |
| Gamut boundary + gamut mapping | **Hand-rolled**, vendored from Björn Ottosson's MIT reference into `src/studio/color/oklabCusp.ts`. `compute_max_saturation()` is a fitted polynomial plus one Halley step — it gives the sRGB boundary for a hue in a handful of FLOPs, which is what lets the picker draw a live boundary curve at 60 fps on a 2D canvas with no solver. ~200 lines, one file, zero dependencies. Fallback if our port misbehaves: `@texel/color@1.1.11` (MIT, zero deps, `findCuspOKLCH`/`gamutMapOKLCH`) — verified, pre-approved, not installed by default. |
| Contrast | **Hand-rolled, ten lines.** WCAG 2.x: linearise each sRGB channel (`0.03928/12.92`, `((c+0.055)/1.055)^2.4`), dot with `[0.2126, 0.7152, 0.0722]`, `(L1+0.05)/(L2+0.05)`. **This must be in-house.** Every APCA-based option is legally unusable: `apca-w3` is *All Rights Reserved, patent(s) pending, web content only* and depends on `colorparsley`, which is **AGPL-3.0**. That chain silently taints Adobe Leonardo, `apcach`, Huetone and Harmonizer. WCAG 2.x is the only contrast algorithm in this domain that is not licence-poisoned. |
| **CI gate** | Add `colorparsley`, `apca-w3`, `apcach` to a blocked-dependency check. A teammate running `npm i @adobe/leonardo-contrast-colors` would otherwise pull AGPL-3.0 into a distributed Electron binary. |
| Scale generation | **Hand-rolled**, ~120 lines, reimplementing `radix-theme-generator`'s algorithm from its description: for each of the 12 steps, solve for the OKLCH lightness/chroma that reproduces the **reference scale's contrast ratio against the chosen background**. It transfers the *relationships* of a hand-tuned scale onto a new hue rather than interpolating — which is exactly "user picks one brand colour, app generates the design system". Do not install it: it pins `colorjs.io@^0.5.2` against a current 0.7.x. |
| Even lightness | Chroma.js's `correctLightness` idea, ~25 lines: after building the ramp, resample the domain so perceived lightness moves linearly across the steps. |
| Solve-for-contrast | Bisection on OKLCH lightness against our own luminance function. ~40 licence-free lines. This is `apcach`'s inverted API without `apcach`. |
| Extract from image | **Reuse our own code.** `buildPalette(pixels, n, auto)` and `refinePalette(pixels, palette, iters)` are already exported from `trace.ts` (lines 212, 444). Add a ~30-line role-scoring pass (node-vibrant's taxonomy, reimplemented): score each quantised colour on saturation and luminance against target ranges and pick the best fit per role — **Dominant / Vibrant / Muted / Dark / Light / Accent**. Named roles, not six anonymous hexes. **Zero new dependencies for the owner's "extract colours" feature.** |
| Dark mode | Invert L in OKLCH about the mid-point, hold H, clamp C to the cusp at the new L. Then apply Huetone's invariant: **lock every hue in the palette to the same lightness at the same step index**, so swapping `red-600` for `blue-600` anywhere leaves contrast unchanged. That turns contrast from a per-pair check into a system invariant. |
| CVD simulation | **Hand-rolled from libDaltonLens (Unlicense — public domain, no attribution obligation).** ~100 lines. The rule that matters: Viénot 1999 (one 3×3 matrix) for protan/deutan, **Brettel 1997 (two half-planes, chosen by side of the neutral axis) for tritan** — everyone who ships one matrix for all three gets tritanopia visibly wrong. Severity = linear interpolation to the simulated colour, giving the slider for free. |
| Seed data | Tailwind v4's ~264 OKLCH triples, copied as data from `packages/tailwindcss/theme.css` (MIT), plus Radix's 12-step semantic contract as the *meaning* of each step (1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solid fills, 11–12 text). **A design-system panel that starts empty does not get used.** |
| `.ase` export | Hand-rolled, ~200 lines of binary writing. We already have an Illustrator COM bridge; ASE is the missing half — palettes then round-trip natively into Illustrator and Photoshop. |

**Why not a colour-picker library.** `Coloris` is the only one with an `rtl` option — but its README states there is only one true instance and multiple pickers cannot be shown simultaneously. A shape inspector needs a **fill** picker and a **stroke** picker side by side. That is a decisive functional block, not a preference. We hand-roll on canvas and own RTL ourselves. `@irojs/iro-core` (MPL-2.0, zero deps, pure hit-test geometry) is pre-approved as a vendored fallback if the wheel maths gets painful — kept in its own directory and never edited in place, which satisfies MPL's file-level copyleft.

---

### (c) TEMPLATES

**What a template is on disk**

One self-contained JSON file, `*.exelmj-tpl.json`, holding exactly one `ComponentDef` with `content` inline. Two required fields (`name`, `type`); everything else optional. A template can be emailed, dropped into a folder, and used — no database, no server, no index rebuild.

The library is a flat JSON array of relative paths — the excalidraw-libraries pattern, which is proven at 231 entries with no backend:

```
resources/templates/index.json     [{ name, description, type, source, preview, created, updated, version, tags }]
resources/templates/<slug>.exelmj-tpl.json
resources/templates/<slug>.png
%APPDATA%/EXELMJ/templates/…       ← user templates, same shape, merged at load
```

**Authoring from a selection**

1. Select ≥1 object. `Template ▾ → Save selection as template…`
2. Geometry is rebased to the selection bbox (local pt, 0,0 top-left). Token refs are preserved; unbound literal colours are offered for promotion to tokens ("3 colours are not in your palette — add them?").
3. **Slot detection.** For every text box, image and colour field, propose a slot with the current value as default. The user ticks which become slots.
4. A 256 px preview PNG is rendered via `@resvg/resvg-wasm` and inlined.
5. Written to the user template folder; `index.json` updated.

**Auto-slotting from repetition** (this is what makes a captured product grid become *one* template rather than six cards): run tree-edit-distance across sibling subtrees, cluster pairs under a threshold, and read `.pairs()` to learn exactly **which fields differ between instances — those fields are the slots.**
Library: `edit-distance@1.0.5` (Apache-2.0 — verified). It takes *your own* children accessor and cost functions, so it runs directly on our `Frame`/`ShapeV4` types with no adapter. Dormant since 2022 is fine: Zhang-Shasha is a 1989 algorithm, frozen, and the package is small enough to vendor. Container selection uses scrapinghub/mdr's verified heuristic — pick the candidate container nearest the element with the most text nodes — reimplemented in TS (that repo is archived Python).

**Instancing**
`ComponentInstance{def, x, y, overrides}`. Editing the def updates every instance. `Detach` expands the leaves into the page and drops the link. Nested instances resolve via `dependencies`, with a cycle check on save.

**Bundled starter set** (authored by us, no third-party assets — this matters, because every "free UI kit" is CC-BY at best):
`Login screen` · `Dashboard shell` · `Settings list` · `Data table` · `Card grid` · `Empty state` · `Modal dialog` · `Toolbar` · `Form (RTL)` · `Invoice (A4, RTL)` · `Business card` · `Icon sheet 24`.
Each ships in both LTR and RTL variants, because a mirrored screen is not a CSS flip — the Arabic version is a different design and must be authored as one.

**Artboard / device presets**
`playwright-core`'s `deviceDescriptorsSource.json` (Apache-2.0). **Verified by download: 207 entries**, first key `Blackberry PlayBook` = `{viewport:{600,1024}, deviceScaleFactor:1, isMobile:true, hasTouch:true, defaultBrowserType:'webkit'}`. Note 100 of the 207 keys end in `" landscape"` (so roughly half the devices have an explicit landscape twin, not all), and 115 of 207 carry an extra `screen` field. 80 KB of static JSON, zero code, works offline by construction. Plus our own print presets: A4/A3/Letter portrait & landscape, and square social sizes.
Written as `pageKind: {kind:'device', preset, w, h, dpr}`. px→pt is `×72/96`.

---

### (d) LAYOUT

**The engine: Chromium, via a hidden shadow-root DOM oracle. No layout library.**

We ship Electron 43. Electron 43 *is* Chromium. Chromium contains a complete, spec-conformant, RTL-correct implementation of flexbox, CSS Grid, block flow and writing modes, with `direction:rtl` and logical properties handled natively. **Loading a second, worse, flexbox-only layout engine as a WASM blob into a process that already links the best one in the world is not a trade-off, it is a mistake.**

Concretely (~40 lines, verified against Motion Canvas's `Layout.ts`/`View2D.ts`, MIT):

1. Once, at studio init: create a `<div id="exelmj-layout-frame">` with `position:absolute; opacity:0; overflow:hidden; pointer-events:none`, **prepend it to `document.body`**, and `attachShadow({mode:'open'})`.
   **This element MUST be attached to the live document** — `getBoundingClientRect()` returns all zeros on a detached node. That is the detail that makes or breaks the technique. The shadow root is what stops page CSS leaking in.
2. Mirror each `Frame` and each child as a `<div>` with `display:flex` (or `grid`) and `box-sizing:border-box`. Write every layout property as an **inline style**. Leaves get their intrinsic size as `width`/`height`; `hug` leaves get `width:max-content`.
3. `element.replaceChildren(...)` for the child list.
4. Read each node's `getBoundingClientRect()`, subtract the parent's rect → canvas-local geometry.
5. Write the results back onto the leaves' absolute `x/y/w/h` in pt (÷ layout scale, which we fix at 1 px = 1 pt so no rounding drift enters).

Cost: zero bytes shipped, zero WASM, zero async init, **CSS Grid for free** — which the published `yoga-layout@3.2.1` does not have (its shipped `Display` enum is `Flex | None | Contents`; `Grid` exists only on the unreleased `main` branch), and the strongest Arabic-RTL story available anywhere in the research.

**Held in reserve, not installed:** if we later need layout in a Web Worker (no DOM) or byte-stable PDF output, `yoga-layout@3.2.1` (MIT, WASM base64-inlined into a single ESM file, `Direction.RTL` present) for flex, or `taffy-layout@2.0.3` (MIT, real CSS Grid, 512 KB WASM) for grid. Neither is needed for on-canvas interactive layout.

**Direct manipulation — the part that is genuinely hard**

Chromium tells you *where boxes landed*. It will never tell you *what insertion index a drag is hovering over*. That is our code, ~60 lines, reimplemented from Penpot's `drop_area.cljc` behaviour (algorithm, not expression — no MPL obligation):

1. Transform the pointer into the frame's local space (inverse of the frame transform).
2. Split each laid-out child's rect into a leading half and a trailing half along the main axis, **reversed when `dir` resolves to RTL**.
3. Add a full-width drop area per line for wrapped/column-cross insertion.
4. Take the **first** area containing the point; its index is the insertion index.
5. Paint a 2 pt insertion caret there.

Interaction rules:
- Dragging a child **inside** a layout frame reorders it; it does not free-position it. Hold `Alt` to escape and set `LayoutChild.absolute = true`.
- Dragging a child **out** of the frame removes it from `children` and restores its absolute geometry (which was always correct, because layout writes back to absolute).
- Resizing a `hug` frame flips it to `fixed` and tells the user so, once, in the status bar.
- **Siblings animate to their new positions** over ~140 ms. This is not decoration: when siblings snap instantly the layout rule is invisible and reads as a bug; when they glide, the rule explains itself with no documentation. We have every before-and-after rectangle in hand, so this is a lerp.

**Modifiers as pure functions** (interact.js's architecture, none of its code — it binds to DOM elements and we have none). Every drag/resize runs proposed coordinates through a composed list: `snapToGrid → snapToGuides → snapToSiblings → restrictToFrame → lockAspect → clampMinMax`. Each is `(proposed, ctx) => adjusted`. This is how handles get built correctly the first time instead of accreting into one tangled `onPointerMove`.

**Spatial index.** `rbush@4.0.1` (MIT; one dependency, `quickselect@3.0.0`, ISC — verified). Today hit-testing and snap-candidate search are O(n) linear scans on every pointer move — fine for the loose illustrations `designApp.ts` handles now, untenable the moment a captured page lands with several hundred nodes. `load()` for bulk insert, `search(bbox)` for marquee, `collides(bbox)` for overlap. **Adopt before building handles, not after.**

---

## 3. THE PICKER BRIDGE

### 3.0 The governing fact

`componentJson()` exports `html` + `css` + `size:{w,h}` and **no per-node geometry**. Therefore the bridge is not a translator — **it is a layout engine run.** We must re-lay-out the captured markup and read the boxes back out. Everything below follows from that.

### 3.1 Transport

The picker is a Chrome MV3 extension in a different browser; it cannot talk to our process. Three ingest routes, all offline:

- **A — File.** Picker's existing `btnUiJson` writes `ui-components-N.json` to Downloads. EXELMJ has `Import ▸ Element Picker JSON…`. **Ships first; zero changes to the extension.**
- **B — Clipboard.** Paste the same JSON onto the canvas. `designApp` already owns paste.
- **C — Watched folder.** Main process watches `%USERPROFILE%\Downloads` (or a configured folder) for `ui-*.json`; a toast offers import. Opt-in, off by default.
- **D — In-app browser (later).** Our own `WebContentsView`, our own picker overlay (§3.7).

**No local HTTP server, no port.** If a live channel is ever needed it is a Windows **named pipe** under `\\?\pipe\`, never a listening socket.

### 3.2 The pipeline

```
 ┌─ 0 INGEST ────────────────────────────────────────────────────────────┐
 │ picker JSON → validate against a hand-written schema → CaptureRecord  │
 │ (raw html/css/tailwind kept verbatim + SHA-256 hash)                  │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓  { html: string, css: string }
 ┌─ 1 SANITISE ──────────────────────────────────────────────────────────┐
 │ DOMParser (built in) → strip <script>, on* attrs, <iframe>, <object>  │
 │ css-tree parse → drop @import, expression(), behavior:, -moz-binding  │
 │ HARD ASSERTION: zero http(s): references survive this stage           │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓  sanitised DOM + AST
 ┌─ 2 INLINE ────────────────────────────────────────────────────────────┐
 │ every url() and <img src> → data: URI (already inlined by the picker  │
 │ in most cases; we re-verify and fail loudly if not)                   │
 │ @font-face src → data: URI, or record as "font unavailable"           │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓
 ┌─ 3 PRUNE ─────────────────────────────────────────────────────────────┐
 │ css-tree walk: delete every rule whose selector matches nothing in    │
 │ the captured subtree. (SingleFile's dead-CSS idea, reimplemented —    │
 │ SingleFile itself is AGPL-3.0 and must never be linked, vendored or   │
 │ read for code.) A 400 KB framework stylesheet becomes a few KB.       │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓
 ┌─ 4 LAYOUT ─── the load-bearing stage ─────────────────────────────────┐
 │ mount into a sandboxed offscreen <iframe sandbox="allow-same-origin"> │
 │ srcdoc = <meta CSP: default-src 'none'; img-src data:; font-src data:;│
 │           style-src 'unsafe-inline' data:>                            │
 │ set the iframe width to CaptureRecord.size.w; dir from the capture    │
 │ force document reflow, wait 2 rAF + document.fonts.ready              │
 │ walk the tree: getBoundingClientRect() + getComputedStyle() per node  │
 │ → LayoutNode[] { path, rect, style, textRuns[], role, name }          │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓  px, viewport-relative
 ┌─ 5 SEMANTICS ─────────────────────────────────────────────────────────┐
 │ html-aria getRole(tag, attrs, ancestors) → 'button' | 'tab' | …       │
 │ accname-lite (hand-rolled: aria-label → aria-labelledby → <label> →   │
 │ text content → title) → the name                                       │
 │ ⇒ layers read "Submit button", "Search field", not "div div path"     │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓
 ┌─ 6 DECOMPOSE ── one element becomes a STACK of primitives ────────────┐
 │ per node, in paint order: shadow → background → border → content →    │
 │ text runs. Never one flat blob. (dom-to-svg's decomposition.)         │
 │ px → pt = ×72/96, rebased to the component's top-left                 │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓
 ┌─ 7 STRUCTURE ─────────────────────────────────────────────────────────┐
 │ display:flex|grid + >1 child          → Frame{layout:{…}}             │
 │ everything else with children         → Frame{layout:null}            │
 │ repeated siblings (edit-distance TED) → ComponentDef + N instances    │
 │ every leaf gets OriginRef{capture, path, role, name, layer}           │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓
 ┌─ 8 TOKENISE ──────────────────────────────────────────────────────────┐
 │ @projectwallace/css-analyzer over the pruned CSS → the distinct       │
 │ colours, font-sizes, spacing, radii, shadows the site ACTUALLY uses   │
 │ → proposed token set; user names/prunes; matched literals become refs │
 └───────────────────────────────────────────────────────────────────────┘
                          ↓
 ┌─ 9 COMMIT ── ONE undo entry for the whole import ─────────────────────┐
 └───────────────────────────────────────────────────────────────────────┘
```

### 3.3 CSS-effect → canvas mapping table

| CSS (computed) | Becomes | Fidelity | Notes |
|---|---|---|---|
| `background-color` | `ShapeV4{kind:'rect', fillPaint:{solid}}` | exact | alpha → `Paint.alpha` |
| `background-image: linear/radial-gradient` | `fillPaint:{linear|radial}` | exact | `gradient-parser@1.2.0` (MIT — verified via registry `licenses[]`; **zero runtime deps**). Handles conic + all `repeating-` forms; we **rasterise conic** (§3.4). |
| `background-image: url(data:…)` | `PlacedImage` clipped to the box | exact | `background-size/position` → `crop` + fit |
| `border-radius` (per-corner, incl. `x/y` pairs) | `radius:[tl,tr,br,bl]` | exact for symmetric; **elliptical corners rasterise** | rounded-rect path construction lifted from `html2canvas-pro` (MIT) — read the code, do not install it |
| `border-*` (uniform) | `stroke` + `strokeWidth` + `align:'inside'` | exact | |
| `border-*` (mixed widths/colours) | 4 separate path shapes | exact | one per edge, mitred |
| `box-shadow` (outer) | offset+blurred copy behind | **approx** | blur → canvas `shadowBlur`; spread → geometric inflate |
| `box-shadow: inset` | inset ring path, clipped | **approx** | |
| `opacity` | `ShapeV4.opacity` / `Frame` group opacity | exact | |
| `transform: translate/scale/rotate` | folded into x/y/w/h + `rotation` | exact | |
| `transform: skew` / `matrix` with shear | **rasterise the subtree** | — | our model has no shear |
| `transform: 3d`, `perspective` | **rasterise** | — | |
| `clip-path: inset/circle/polygon` | boolean-clip the path | exact | needs the boolean engine (M6); before that, rasterise |
| `filter: blur/drop-shadow` | **rasterise** | — | |
| `backdrop-filter` | **rasterise, flagged unsupported** | — | it blurs what is painted *behind*; structurally unreproducible |
| `mix-blend-mode` | flatten via culori `blend` | approx | |
| `font-*`, `line-height`, `letter-spacing` | `TextBox` + `typography` token | exact where font available | §3.5 |
| `text-shadow` | offset copy behind the run | approx | |
| `background-clip: text` | **rasterise** | — | |
| `overflow: hidden` | `Frame.clip = true` | exact | |
| `::before` / `::after` with `content` | their own shapes/text | exact | pseudo-elements are read via `getComputedStyle(el, '::before')` |
| `content: counter()` | **rasterise, flagged** | — | known limitation of every cloning approach |
| `<canvas>`, WebGL, `<video>` | **rasterise a single frame, flagged** | — | |
| `@keyframes` (incl. the picker's re-synthesised JS motion) | stored on `CaptureRecord`, **not rendered** | — | preserved for the ZIP + Markdown handoff; the canvas is static |

### 3.4 Vectorise-vs-rasterise policy

**Vectorise by default. Rasterise only on an explicit, enumerated trigger.** The triggers are exactly the "rasterise" rows above, plus:

- node subtree depth > 40, or node count > 2,000 (a runaway wrapper chain);
- any element whose computed style we cannot round-trip through `css-tree`'s lexer against the W3C grammar for that property (the defensive check that stops one exotic declaration corrupting a whole component);
- user override: right-click → *Flatten to image*.

Rasterisation writes a `PlacedImage` at 3× device scale with `origin.layer='raster'`, so the user sees exactly which parts are pixels and can retry them individually. Renderer: `@zumer/snapdom@2.24.1` (MIT, zero deps — **note the scope; plain `snapdom` on npm is an unrelated 2017 state library**). It renders via `<foreignObject>`, so its output is *always* pixels and can never be editable shapes — which is precisely why it belongs here and nowhere else.

**Every import ends with a limitations report** listing what could not be reproduced, per element, shown in a panel and written into the ZIP. Users forgive a documented gap; they never forgive a silent wrong result.

### 3.5 Arabic text and webfonts

**Text.** Stage 4 reads `element.getClientRects()` per text node, giving one rect per **line box** with Blink's bidi and Arabic shaping already resolved. Each becomes a `TextBox` with `align` derived from the *resolved* `direction` + `text-align:start/end`, not from the literal keyword.

- **Never re-shape.** We do not re-run bidi on captured text. Chromium already did it, correctly, and re-doing it is a bidi-regression generator. This is also why `satori` is disqualified outright: its README states *"RTL languages are not supported"*, and it has no OpenType feature support, which means it cannot render Arabic even if RTL were bolted on — Arabic *is* ligatures.
- **Regression suite for our own bidi.** Run `bidi-js@1.0.3` (MIT) as a **test-time oracle** against `src/design/bidiRuns.ts` on Arabic-with-embedded-Latin corpora, and assert identical run boundaries. This converts "we think our Arabic is right" into "our Arabic agrees with a UAX #9 conformance-tested implementation" — **without shipping the dependency**. `bidiRuns.ts` works today; replacing working RTL code with a dormant dependency is a regression risk against our most important constraint for zero new capability.

**Fonts.** Four-step ladder, decided per text run and **recorded in the model** so the user can see and reverse it:

1. Font family is installed locally (`settings.systemFonts` already exists) → live `TextBox`, font name recorded. **Best case, fully editable.**
2. Font arrived as a `data:` `@font-face` → write to `%APPDATA%/EXELMJ/fonts/`, register via `FontFace`, live `TextBox`. Record the licence risk in `CaptureRecord.unsupported` — we embed for *local editing*, and the ZIP exporter offers "omit embedded fonts".
3. Font is unavailable → **outline the run** with `opentype.js@2.0.0` (MIT, **zero deps** — verified) into `ShapeV4{kind:'path'}`, `origin.layer='text'`. Looks right forever and offline; not editable as text.
4. Nothing works → substitute the nearest local family, flag it visibly.

The choice per run is stored, so a user can re-link a font later instead of discovering the substitution at export time. **Outline-on-import as a fallback, live text as the default.**

For deterministic Arabic *rendering* (icon preview strip, PNG export), `@resvg/resvg-wasm` is pointed at explicit font **files** with system font loading disabled — the difference between reproducible output and machine-dependent output.

### 3.6 What crosses each boundary

| Boundary | Payload |
|---|---|
| Extension → disk | `ui-components-N.json` (picker's existing format, unchanged) |
| Disk → main process | file bytes (`file:read-silent`, exists today) |
| Main → renderer | the parsed JSON, over the existing `contextBridge` |
| Renderer → offscreen iframe | `srcdoc` string; **no message channel, no scripts** |
| Offscreen iframe → renderer | nothing. The parent *reads* the iframe's DOM synchronously via `contentDocument` (same-origin `srcdoc`). One-way. |
| Bridge → model | one `applyState`-shaped commit: `{frames, shapes, boxes, images, tokens?, components?}` + one `CaptureRecord` |

### 3.7 The in-app browser (M8b, later)

Main process opens a `WebContentsView` (present in Electron 43.1.1's type definitions — verified) in a second window. `webContents.debugger.attach()` + `DOMSnapshot.captureSnapshot({computedStyles:[…whitelist…], includePaintOrder:true, includeDOMRects:true})` gives post-layout absolute bounds and per-run text boxes directly — no offscreen iframe needed, because Blink already laid it out in a real page. A ~200-line decoder resolves the interned integer arrays against the flat `strings[]` table into stage-5 input, and the pipeline continues unchanged from there.

Three cautions:
- CDP is **not** available to renderers; this is main-process-only, which is why it lives here.
- The `DOMSnapshot` domain is marked **experimental** — pin behaviour to the shipped Chromium and re-test on every Electron upgrade. Add a smoke test that captures a fixture page and asserts the field shape.
- `Page.captureSnapshot` (MHTML) gives a BSD-licensed single-file offline archive for free. Store it beside the capture so "view it offline later" needs no inliner of our own.

---

## 4. THE THREE DELIVERY ROUTES

### PRIMARY: **(ii) the ZIP bundle.** MCP is second. Markdown is a *view* of the ZIP, not a third exporter.

**Why ZIP is primary:**
1. **It cannot fail to install.** MCP delivery in Claude Desktop on Windows has a confirmed, four-issue trap: the "Edit Config" button opens `%APPDATA%\Claude\claude_desktop_config.json` while an MSIX-installed app reads `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\`. A non-programmer edits the file, nothing happens, and the feature is dead with no error message.
2. **Protocol risk.** The 2026-07-28 MCP revision **deletes** `initialize`/`notifications/initialized` and mandates `server/discover`. No source confirms a v2 server falls back to whatever the *installed* Claude Desktop speaks. A ZIP has no handshake.
3. **The ~1 MB content ceiling.** Claude Desktop caps content returned from MCP servers at roughly 1 MB, and `ImageContent` is returned as text (issue #31208, **closed as NOT PLANNED** — a permanent constraint, not a bug to wait out) at ~15–25k tokens per image versus ~1,600 for a native block. A design with embedded images cannot be delivered through a tool result. It can trivially be delivered as a file.
4. **The owner can see it.** A folder he can open, inspect and email. MCP is invisible until it works.

All three routes are **renderings of one document**, produced by one emitter with a transform/format/filter triad (Style Dictionary's architecture, ~200 lines of ours, none of its 13 dependencies).

### (i) MCP tool surface

**Process architecture** — three processes, one long-lived:

```
Claude Desktop
   │ spawns per conversation, stdio, JSON-RPC
   ▼
EXELMJ.exe  (env ELECTRON_RUN_AS_NODE=1, args ["<install>/resources/mcp/bridge.cjs"])
   │  ← stateless, disposable; NO Node install, NO npx, NO network needed
   │  named pipe  \\?\pipe\exelmj-studio-<userSid>
   ▼
EXELMJ main process  ← long-lived, owns the document, the ONLY source of truth
   │  existing ipcMain / webContents channels
   ▼
EXELMJ renderer (designApp / studio)
```

- `ELECTRON_RUN_AS_NODE=1` makes our own shipped exe act as a plain Node runtime, so the config's `command` is a path we control and the user needs nothing installed. **Check the `runAsNode` fuse is not disabled by the packager** — some hardening presets flip it, and then the variable is silently ignored.
- The named pipe replaces blender-mcp's open TCP port: no listening network interface. Node's docs state pipes do not persist and Windows removes them when the owning process exits — **so the pipe's existence is a free liveness probe**. If it is absent, the bridge fails fast with `"Open EXELMJ first"` instead of hanging.
- SDK: `@modelcontextprotocol/sdk@1.30.0` (MIT — verified). The v1 legacy monolith, deliberately: it is what every currently-installed Claude Desktop was tested against, it is one dependency, and it needs no HTTP server, no Hono, no OAuth. Keep the tool surface thin enough that a v2 port is a transport swap.
- **The installer writes both config paths** (`%APPDATA%\Claude\` and the MSIX-virtualised path) or detects MSIX. Ship as an `.mcpb` bundle (manifest 0.3, `server.type: "node"`, `${__dirname}` in args) for one-click install — noting `${__dirname}` is itself known to resolve to the virtualised path in MSIX installs, so the bridge resolves its own directory defensively.
- **Server name:** `exelmj-studio`. Letters/numbers/hyphens/underscores only. `workspace`, `claude-in-chrome`, `computer-use`, `Claude Preview`, `Claude Browser` are reserved and rejected.

**Tools** — every one returns compact JSON or Markdown **plus absolute file paths**, never base64 pixels:

| Tool | Input | Returns |
|---|---|---|
| `studio_status` | — | `{running, documentPath, pageCount, dirty, activePageId}` |
| `list_pages` | — | `[{id, name, kind, w, h, counts:{frames,shapes,texts,images}}]` |
| `describe_page` | `{pageId, depth?}` | Markdown outline: frame tree, layout props, text content, token refs. **No pixels.** |
| `get_tokens` | `{theme?}` | DTCG JSON of the token tree |
| `set_token` | `{path, value, theme?}` | ok/err — *the write path; edits land live on the canvas* |
| `list_components` | `{type?}` | `[{name, type, slots, instanceCount}]` |
| `get_component` | `{name}` | the `ComponentDef`, geometry included |
| `create_component` | `{name, type, content}` | ok/err |
| `place_instance` | `{pageId, def, x, y, overrides?}` | new instance id |
| `list_icons` | `{query?}` | `[{name, grid, targets, validatorState}]` |
| `export_bundle` | `{outDir, pages?, include?}` | `{zipPath, manifestPath, markdownPath, bytes}` |
| `export_markdown` | `{pageId?}` | the Markdown text inline (small, safe under the cap) |
| `render_preview` | `{pageId, maxPx?}` | `{pngPath, w, h}` — **a path, never the bytes** |
| `list_captures` | — | `[{id, url, capturedAt, unsupported[]}]` |

Everything is asked for **up front in `inputSchema`**: Claude Desktop supports neither elicitation nor sampling, so a tool that pauses mid-call to ask a question silently dies there.

### (ii) The ZIP bundle

Container tree modelled on Penpot's `.penpot` layout (a documented, shipped design-tool ZIP with colours, components, typographies and tokens already broken out as first-class folders — an archive structure is not copyrightable, so we copy the tree and none of the code). Written with **`jszip@3.10.1`, already a dependency** — no new package.

```
design-bundle-<slug>-<yyyymmdd>.zip
│
├── README.md                        ← the Markdown handoff (§iii), verbatim
├── manifest.json                    ← container version 1 (structure)
│     { formatVersion:1, dataVersion:4, generator:"EXELMJ 0.4.0",
│       created, documentName, source, pages[], counts{}, checksums{} }
├── LIMITATIONS.md                   ← what could not be reproduced, per capture
│
├── design/
│   ├── document.json                ← the whole DesignProject v4, verbatim
│   ├── pages/
│   │   ├── 001-<slug>.json          ← one page, self-contained
│   │   └── …
│   └── components/
│       ├── <name>.exelmj-tpl.json   ← one file per ComponentDef
│       └── index.json
│
├── tokens/
│   ├── tokens.json                  ← DTCG, light (default theme)
│   ├── tokens.dark.json             ← DTCG, dark overlay
│   ├── tokens.css                   ← :root custom properties, sRGB hex
│   ├── tokens.oklch.css             ← :root custom properties, OKLCH (P3-ready)
│   └── palette.ase                  ← Adobe Swatch Exchange
│
├── icons/
│   ├── index.json                   ← [{name, grid, targets, file, preview}]
│   ├── svg/<name>.svg               ← optimised, viewBox + title preserved
│   ├── png/<name>@1x.png  @2x  @3x
│   ├── ico/<name>.ico                (only if the user asked)
│   └── font/exelmj-icons.ttf + codepoints.json   (only if the user asked)
│
├── preview/
│   ├── page-001.png                 ← full page, 2x
│   ├── page-001.svg                 ← full page, vector
│   └── components/<name>.png        ← 256px
│
├── captures/                        ← only when the picker was used
│   └── <captureId>/
│       ├── capture.json             ← CaptureRecord minus raw
│       ├── original.html            ← verbatim from the picker
│       ├── original.css             ← verbatim
│       ├── pruned.css               ← after dead-rule removal
│       ├── keyframes.css            ← re-synthesised motion, preserved
│       └── snapshot.mhtml           ← only from the in-app browser path
│
├── assets/
│   ├── images/<hash>.png|.jpg       ← content-addressed side table
│   └── fonts/<family>-<weight>.ttf  ← omitted when "omit fonts" is ticked
│
└── code/                            ← optional, opt-in
    ├── page-001.svg
    ├── page-001.html                ← absolute-positioned, logical properties
    └── page-001.css
```

Two independent version numbers, Penpot's discipline: `formatVersion` tracks the **tree**, `dataVersion` tracks the **document schema**. They move for different reasons and conflating them is how import compatibility rots.

`assets/images/<hash>.ext` is Excalidraw's content-addressed side table, and it is a **direct fix for a problem we have today**: `PlacedImage.src` is a base64 data URL living inside the document array, so the same logo placed on ten pages is stored ten times and every undo snapshot deep-copies all of it. In the bundle, images leave the array. (Doing the same *inside* the live document is a worthwhile follow-up, listed as debt.)

### (iii) The Markdown handoff

One file, `README.md`, at the ZIP root and also emittable standalone. Exact skeleton:

```markdown
# <Document name>
<one-line description> · EXELMJ <version> · <ISO date> · <N> pages, <M> components, <K> icons

## 1. How to read this bundle
<3 lines: where the design lives, where the tokens live, what is a preview>

## 2. Design system
### 2.1 Colours
| Token | Value (hex) | OKLCH | Contrast vs bg | Role |
### 2.2 Typography
| Token | Family | Size (pt) | Weight | Line height | Direction |
### 2.3 Spacing & radii
| Token | Value (pt) |
### 2.4 Shadows
| Token | Value |
> Themes: light (default), dark. Dark is an overlay — only the listed tokens differ.

## 3. Screens
### 3.1 <Page name> — <W>×<H> pt (<device preset>)
![preview](preview/page-001.png)
**Structure**
- Frame "Header" — row, gap 16, padding 24 16, justify space-between, dir rtl
  - Text "تسجيل الدخول" — 24 pt, bold, colour {color.text.primary}
  - Instance of `IconButton` (icon: menu)
- …
**Notes** <anything a reader needs: fixed vs hug, overflow, RTL specifics>

## 4. Components
### 4.1 `<Name>` (<type>)
<description> · <W>×<H> pt · used <N>×
| Slot | Type | Default |
Composed of: `<dependency>`, `<dependency>`

## 5. Icons
| Name | Grid | Stroke | Targets | Pixel-grid | File |

## 6. Captured from the web
| # | URL | Element | Captured | Not reproduced |
> Motion captured from these components is preserved in
> `captures/<id>/keyframes.css` and is NOT rendered on the canvas.

## 7. Limitations
<the LIMITATIONS.md content, verbatim>

## 8. File index
<the tree above, annotated>
```

Rules: **no base64 anywhere**; every image is a relative path; every colour appears as both hex and OKLCH; every number carries its unit; Arabic content is quoted verbatim (never transliterated) with `dir` stated.

---

## 5. FILE LAYOUT AND DEPENDENCIES

### 5.1 New tree under `D:\EXELMJ\src\studio\`

```
src/studio/
├── model.ts                 the v4 types in §1.4; pure, no DOM
├── migrate.ts               v1/v2/v3 → v4; the v3 downgrade projection
├── ids.ts                   id allocation (fixes the maxIdSuffix duplicate-id class)
├── spatial.ts               rbush wrapper: index build, marquee, snap candidates
│
├── geom/
│   ├── path.ts              svgpath normalise/round/transform; subpath split
│   ├── outline.ts           bezier-js stroke→fill
│   ├── transform.ts         rotation, bbox-under-rotation, handle maths
│   ├── modifiers.ts         snap/restrict/aspect/clamp as pure functions
│   └── boolean.ts           (M6) union/subtract/intersect/exclude
│
├── color/
│   ├── oklabCusp.ts         VENDORED Ottosson MIT ref (~200 lines) + provenance header
│   ├── convert.ts           the one culori façade; the ONLY parser in the app
│   ├── contrast.ts          hand-rolled WCAG 2.x + verdict + solve-for-contrast
│   ├── scale.ts             12-step generation, correctLightness, dark derivation
│   ├── extract.ts           reuses trace.ts buildPalette/refinePalette + role scoring
│   ├── cvd.ts               Viénot + Brettel, severity slider
│   ├── tokens.ts            DTCG tree, alias resolution, cycle detection
│   └── ase.ts               Adobe Swatch Exchange writer
│
├── icons/
│   ├── presets.ts           Material/Lucide/Octicons constants (§2a table)
│   ├── keylines.ts          overlay geometry
│   ├── validator.ts         pixel-grid check per target size
│   ├── preview.ts           resvg-wasm multi-size strip
│   ├── library.ts           the tree-picked Iconify subset loader
│   ├── lint.ts              Lucide's import validator rule
│   └── exportIcon.ts        SVG / PNG@n / ICO / ICNS / TTF
│
├── layout/
│   ├── oracle.ts            THE hidden shadow-root DOM layout engine (~120 lines)
│   ├── frame.ts             Frame CRUD, reparenting, absolute↔layout conversion
│   ├── dropIndex.ts         drag position → insertion index (RTL-aware)
│   └── reflowAnim.ts        the 140 ms sibling glide
│
├── templates/
│   ├── format.ts            *.exelmj-tpl.json read/write/validate
│   ├── registry.ts          index.json merge: bundled + user
│   ├── author.ts            selection → ComponentDef, slot proposal
│   ├── instance.ts          instantiate / update / detach / cycle check
│   ├── repetition.ts        edit-distance TED → def + N instances
│   └── devices.ts           Playwright presets + our print presets
│
├── bridge/
│   ├── ingest.ts            picker JSON schema validation → CaptureRecord
│   ├── sanitize.ts          DOMParser + css-tree strip; the zero-http assertion
│   ├── inline.ts            url()/@font-face → data:; verification
│   ├── prune.ts             dead-CSS removal
│   ├── layoutRun.ts         offscreen sandboxed iframe → LayoutNode[]
│   ├── semantics.ts         html-aria role + accname-lite
│   ├── decompose.ts         LayoutNode → the primitive stack (the mapping table)
│   ├── cssMap.ts            the §3.3 table as data
│   ├── rasterFallback.ts    snapdom, triggers, flagging
│   ├── fonts.ts             the four-step ladder
│   └── report.ts            the limitations report
│
├── deliver/
│   ├── doc.ts               ONE delivery document built from the model
│   ├── transform.ts         transform/format/filter triad
│   ├── zip.ts               the §4(ii) tree, via the existing jszip
│   ├── markdown.ts          the §4(iii) skeleton
│   └── code.ts              optional HTML/CSS/SVG emit
│
├── panels/
│   ├── studioPanel.ts       the shell; RTL docking
│   ├── colorPanel.ts        palette + picker + contrast + CVD
│   ├── iconPanel.ts         grid/preset/preview strip/validator/library
│   ├── templatePanel.ts     browser + author + place
│   ├── layoutPanel.ts       frame inspector
│   ├── capturePanel.ts      captures + limitations
│   └── colorWheel.ts        the hand-rolled OKLCH canvas picker
│
└── workers/
    ├── trace.worker.ts      moves trace.ts off the UI thread
    └── protocol.ts          typed postMessage contract (no comlink — §5.3)
```

### 5.2 Additions to `src/design/`

| File | Change |
|---|---|
| `overlayModel.ts` | accept `version === 4`; add `studio` passthrough; `serializeProject` emits 3 when no v4 feature is used, 4 otherwise; write the `.v3.json` companion on first upgrade |
| `shapes.ts` | extend `Shape`; add validated lines to `cleanShape` for every new field; `paintShape` honours `rotation`/`opacity`/`radius`/`fillPaint`/`rule`; **`SAFE_PATH_D` unchanged** |
| `images.ts` | unchanged (`crop` already complete) |
| `designApp.ts` | **surgical only**: mount the studio panel; add tools `frame`, `icon`, `node`, `crop`; route the new handles through `geom/modifiers`; replace linear hit-test scans with `spatial.ts`; extend `captureState()` to include `frames`/`instances`/`tokens` |
| `trace.ts` | extract the pixel loop behind a worker-callable entry; **no algorithm change** |
| `svgDesign.ts` | emit `rotation`/`opacity`/`radius`/gradients |
| `pdfOverlayExport.ts` | same, plus frame clipping |
| `electron/main.ts` | `WebContentsView` browser window (M8b); named-pipe server (M9) |
| `electron/ipc.ts` | `studio:*` channels; MCP pipe bridge |
| `resources/mcp/bridge.cjs` | new; the stdio↔pipe bridge |
| `scripts/pick-icons.mjs` | new; the licence-gated Iconify tree-pick |

### 5.3 Dependencies — every one justified

**Runtime, shipped (9):**

| Package | Version | Licence | Why it earns its place | What we would otherwise write |
|---|---|---|---|---|
| `culori` | 4.0.2 | MIT | OKLCH/OKLab/P3 conversion, interpolation, ΔE. Zero runtime deps. **One parser for the whole app.** | ~1,500 lines of colour-space matrices we would get subtly wrong |
| `svgpath` | 2.6.0 | MIT | `unarc()`/`unshort()`/`abs()` — guarantees the node editor sees only M/L/C/Z. Zero deps. Battle-tested under fontello's icon-font toolchain, i.e. it has already done our exact job at scale | arc→cubic conversion, which is genuinely hard to get right |
| `bezier-js` | 6.1.4 | MIT | curve-native stroke→outline via `reduce/scale/outline`. Zero deps | offset-curve maths; the graduated `outline(d1..d4)` form is free variable-width strokes |
| `rbush` | 4.0.1 | MIT (+`quickselect` ISC) | R*-tree. Replaces O(n) scans that will not survive an imported page | an R-tree — small but easy to get subtly wrong, and correctness here is invisible until it is slow |
| `@resvg/resvg-wasm` | 2.6.2 | MPL-2.0 | deterministic multi-size raster with **explicit font files and system fonts disabled** — the only way Arabic PNG output is reproducible across machines. Portable WASM: no native rebuild | nothing; `<img src=data:svg>` + `drawImage` is machine-dependent on fonts, which is exactly the bug we cannot afford |
| `opentype.js` | 2.0.0 | MIT | **zero deps (verified).** Text→path for the font ladder; writes TTF, which deletes `svgicons2svgfont`+`svg2ttf`+`ttf2woff2` and their native builds outright | a TrueType writer |
| `png2icons` | 2.0.1 | MIT | **zero deps (verified).** ICO+ICNS in-process. Every alternative pulls `sharp` or `jimp` | ICO/ICNS container writers |
| `css-tree` | 3.2.1 | MIT | parse/walk/prune/regenerate captured CSS, and the **lexer's match-against-W3C-grammar** check that routes unparseable declarations to the raster bucket. (Not dependency-free — `mdn-data`, `source-map` — but the prebuilt browser bundle inlines them) | a CSS parser. Non-negotiable: regex on resolved CSS is how importers die |
| `gradient-parser` | 1.2.0 | MIT (verified via registry `licenses[]`) | **zero runtime deps.** linear/radial/conic + all `repeating-` forms, with `parse()`+`stringify()` symmetry so the ZIP can emit valid CSS back | a gradient grammar |

**Runtime, opt-in / lazy (3):**

| Package | Version | Licence | Loaded when |
|---|---|---|---|
| `svgo` (`svgo/browser`) | 4.0.2 | MIT | SVG export only |
| `@zumer/snapdom` | 2.24.1 | MIT, zero deps | raster fallback fires |
| `html-aria` | 0.5.3 | MIT, zero deps | picker import only |

**Main process only (1):** `@modelcontextprotocol/sdk` 1.30.0, MIT.
**Build time only (2):** `@iconify/json` 2.2.516 (MIT package, per-set icon licences, licence-gated tree-pick); `edit-distance` 1.0.5 (Apache-2.0, could be vendored — Zhang-Shasha is a frozen 1989 algorithm).
**Test only (1):** `bidi-js` 1.0.3 (MIT) as the UAX #9 oracle for `bidiRuns.ts`.
**Already present, reused, zero cost:** `jszip@3.10.1` (the ZIP), `pdf-lib@1.17.1` + `@pdf-lib/fontkit` (PDF), `docx@9.7.1` (Word), `vitest@4.1.10`.

**Pre-approved but NOT installed** (documented so a future decision is a version bump, not a research project): `paper@0.12.18` (MIT, zero prod deps, browser build sets `canvas:false`/`jsdom:false`) used **headlessly as a `PathItem`-only boolean engine** — Bézier-native, so unioning two rounded shapes returns curves, not a flattened polygon; `@texel/color@1.1.11`; `yoga-layout@3.2.1`; `taffy-layout@2.0.3`; `@irojs/iro-core`; `potpack@2.1.0`.

**Explicitly hand-rolled instead** — 12 dependencies avoided:
layout engine (Chromium), colour picker widget (Coloris is single-instance; that blocks a fill+stroke inspector), contrast (WCAG 2.x is ten lines and the *only* unpoisoned option), gamut cusp (Ottosson MIT vendor), scale generation, colour extraction (we already own `buildPalette`/`refinePalette`), CVD (libDaltonLens is public domain), accname-lite (first 3 rules ≈ 95 % of cases; `dom-accessibility-api` is available at 0.7.1 if edge cases bite), rulers/guides (drawing into our own canvas stays in sync by construction — `@scena/*` ships `croact`, a mini-React), token pipeline (Style Dictionary is a Node CLI with 13 deps), ZIP (`jszip` present), worker RPC (a typed `postMessage` union is ~40 lines; `comlink@4.4.2` is Apache-2.0 and fine but unnecessary for two message types).

**Hard-banned in the ADR, with reasons:** `apca-w3` / `colorparsley` / `apcach` (AGPL-3.0 transitively; patent-pending; "web content only" grant that we fall outside of), `@adobe/leonardo-contrast-colors` (same chain), SingleFile (AGPL-3.0 — do not link, vendor, or read for code), Inkscape source (GPL — behavioural inspiration only), tldraw (proprietary, with a licence key and documented usage-telemetry transmission — a direct, unfixable violation of "fully offline"), `oslllo/svg-fixer` and `svg-outline-stroke` (raster round-trips; the latter exact-pins `sharp@0.28.1`), `sharp` and `jimp` in any form (native modules), Xel's Cupertino theme (its licence **prohibits** non-macOS use, and we are Windows-first), IcoMoon-Free (CC BY 4.0 / GPL dual — fails on both branches), any package pulling React/Vue/Preact.

---

## 6. MILESTONE PLAN

Where the four known gaps belong, and what they block:

| Gap | Milestone | Blocks |
|---|---|---|
| **Resize/rotate handles** | **M1** | icon authoring, frames, templates, instances — *everything* |
| **Re-colourable traced paths** | **M2** | colour tokens applied to traced art; icon import |
| **Image crop UI** | **M2** (model already done) | picker import (`object-fit` arrives as a crop) |
| **Off-thread tracing + live preview** | **M5** | raster fallback UX; icon-from-photo; nothing structural |

---

### M1 — Handles, Transform & the v4 Foundation
**Objective.** Every object on the canvas can be resized, rotated and cropped directly, and the document format is ready for everything after.
**Scope.** `model.ts` + `migrate.ts` + `ids.ts`; `Shape.rotation/opacity/radius`; `spatial.ts` (rbush); `geom/transform.ts` + `geom/modifiers.ts`; 8 resize handles + rotate handle + crop handles; snap to grid/guides/siblings; `captureState()` extended.
**Success criteria.**
1. Select any shape/image/text box → 8 handles + a rotate handle; drag resizes/rotates live; Shift locks aspect; Alt resizes about the centre.
2. Select an image → crop handles; the crop is non-destructive and reversible.
3. **Every existing `.exelmj.json` v3 file opens and renders byte-identically to v0.3.0.**
4. A document using no v4 feature still saves as `version: 3`.
5. Undo/redo covers every handle interaction as one entry per gesture.
**Verification.** (a) Golden-file test: 12 real v3 sidecars → load → save → assert byte-identical JSON. (b) Golden-image test: render each to PNG pre- and post-change, assert pixel-identical. (c) Unit tests for rotated-bbox maths and each modifier as a pure function. (d) Perf: 2,000 shapes, pointer-move hit-test < 2 ms via rbush (was O(n)).

### M2 — Path Kernel, Node Editor & Recolour
**Objective.** A traced logo can be repaired, re-coloured and node-edited.
**Scope.** `geom/path.ts` (svgpath normalisation choke point — **every** path in the app funnels through it); subpath splitting so a traced blob becomes addressable regions; node-edit tool (per-node grips, control handles, add/delete node, seg-type conversion); per-subpath fill; `geom/outline.ts` (bezier-js).
**Success criteria.**
1. Any imported/traced/pasted path is M/L/C/Z absolute after import — asserted by a test over the tracer's real output.
2. Node-edit mode shows grips; dragging one changes `d` and re-renders.
3. A traced multi-colour logo can have any one region re-coloured without touching the others.
4. Stroke→outline on a 1.5 pt stroke produces a filled path whose outline deviates < 0.05 pt from the analytic offset.
5. **Relative and absolute commands are colour-coded in the path inspector** (orange/purple) — one CSS class, and it makes the single most confusing thing about SVG paths self-evident.
**Verification.** Property test: 500 random paths → normalise → render both → assert pixel-identical. Deviation test against an analytic offset. Manual: repair a real traced customer logo end to end.

### M3 — Colours
**Objective.** The owner builds a real colour system and sees it applied.
**Scope.** All of §2b. `oklabCusp.ts`, `convert.ts`, `contrast.ts`, `scale.ts`, `extract.ts`, `cvd.ts`, `tokens.ts`, `ase.ts`, `colorPanel.ts`, `colorWheel.ts`. Token binding on every colour field. Tailwind-v4 + Radix seed data.
**Success criteria.**
1. Enter a brand hex → 12-step scale, perceptually even, every step in sRGB gamut.
2. The picker draws the live gamut boundary; a colour cannot be dragged out of gamut.
3. Contrast readout shows `AAA/AA/AA Large/Fail`; "solve for 4.5:1" returns a colour that measures 4.50 ± 0.01.
4. "Extract from image" on a photo yields 6 named role swatches in < 300 ms.
5. One click derives a dark theme; every hue keeps equal lightness at equal step index.
6. Changing `color.brand.600` repaints every bound object on every page.
7. Export produces valid DTCG JSON, both CSS files, and a `.ase` that opens in Illustrator.
**Verification.** Unit-test our OKLab matrices against `@csstools/color-helpers` (**MIT-0** — no attribution obligation, so we may paste its spec-derived functions into the test file freely) as ground truth. WCAG values against the published examples. `.ase` verified by round-trip through the existing Illustrator COM bridge. CI licence check rejects `apca-w3`/`colorparsley`/`apcach`.

### M4 — Icons
**Objective.** Author a real icon in the app and ship it as files.
**Scope.** All of §2a, plus the licence-gated Iconify tree-pick.
**Success criteria.**
1. New 24 pt icon artboard with the selected preset's keylines and live area.
2. Preview strip updates at 16/24/32/48/128 on every commit, < 80 ms.
3. Validator flags a stroke straddling a pixel boundary at 16 px and names the node.
4. Insert from the offline library → editable paths, re-colourable, transform/filter/fill rejected by the lint.
5. Export SVG + PNG@1/2/3x + ICO + ICNS from one dialog; the ICO replaces the app icon.
6. **Build fails** if a non-permissive Iconify set reaches `resources/`.
**Verification.** Pixel-diff our 16 px PNG against the upstream Lucide/Tabler SVG rendered by the same resvg build. Licence gate tested by injecting a GPL set name into a fixture `collections.md` and asserting a non-zero exit.

*→ M1–M4 is the first shippable release: "icons, colours and a real editor."*

### M5 — Off-thread Tracing & Live Preview
**Objective.** Tracing never freezes the window, and the user sees the result forming.
**Scope.** `workers/trace.worker.ts` + typed protocol; progressive per-layer emit; cancel; a durable job handle (`{id, status, ttlMs, pollIntervalMs}` + cooperative cancel — MCP Tasks' state machine, used internally whether or not it is ever exposed).
**Success criteria.** UI stays at 60 fps during a 4000×3000 trace; layers appear progressively; Cancel stops within 200 ms; output is byte-identical to the synchronous path.
**Verification.** Long-task instrumentation asserting no main-thread block > 50 ms; identity test synchronous vs worker over 20 fixture images.

### M6 — Frames & Auto-layout
**Objective.** Build a real screen where things arrange themselves.
**Scope.** `layout/*`, frame inspector, absolute↔layout conversion, the drop-index algorithm, reflow animation. `geom/boolean.ts` lands here if icon booleans are wanted (adopt `paper@0.12.18` headlessly, pre-approved).
**Success criteria.**
1. Wrap a selection into a frame; set row/column, gap, padding, align, justify, wrap; children arrange live.
2. `dir:rtl` produces a mirrored arrangement matching a browser rendering of the same flex properties.
3. Dragging a child shows an insertion caret at the correct index, RTL included; drop reorders and siblings glide.
4. `hug` frames resize to content; `fill` children share remaining space.
5. Layout is written back to absolute pt, so PDF/SVG/PNG export needs no layout knowledge.
**Verification.** A 40-case fixture matrix (direction × wrap × justify × align × dir) rendered by our oracle and by a real browser page with identical inline styles; assert every box matches within 0.01 pt. Drop-index unit tests including RTL.

### M7 — Templates & Presets
**Objective.** Save a design once and reuse it.
**Scope.** All of §2c, plus the 12 bundled starters in LTR and RTL, plus the 207 Playwright device presets.
**Success criteria.** Selection → template with proposed slots in ≤ 4 clicks; place an instance and override slots; edit the def and every instance updates; detach expands; a `.exelmj-tpl.json` copied between machines works; new-artboard offers device presets.
**Verification.** Round-trip test: author → serialise → clear → load → instantiate → assert geometry identical. Cycle-detection test. Manual: build a login screen from starters only.

### M8 — The Picker Bridge
**Objective.** Capture a component from a real website and edit it on our canvas.
**8a (ships first):** file/clipboard import → the full §3.2 pipeline → editable objects + limitations report.
**8b (later):** in-app `WebContentsView` browser with our own picker overlay and the CDP `DOMSnapshot` path.
**Success criteria.**
1. Import a picker JSON of a real button → correct geometry (±1 pt vs the browser), correct colours, editable text.
2. Import a card grid → **one** `ComponentDef` + N instances, not N copies.
3. Arabic text imports with correct direction, correct line boxes, and either a live font or an outlined run — the choice recorded and visible.
4. **A test asserts the resulting `DesignProject` contains zero `http(s)` references.**
5. Unreproducible features are listed per element, never silently wrong.
6. A tokenise pass proposes the site's real palette and type scale.
**Verification.** A fixture set of 10 captures from 10 real sites (including 2 Arabic/RTL), each with a browser-rendered reference PNG; assert ≥ 90 % pixel agreement on vectorised regions and that every disagreement above threshold appears in the limitations report. Network assertion runs in CI with the process offline.

### M9 — Delivery
**Objective.** Hand the finished design to Claude Desktop.
**9a ZIP + Markdown** (one emitter, two renderings). **9b MCP** (bridge, pipe, `.mcpb`, dual config paths).
**Success criteria.**
1. `Export ▸ Design bundle…` produces the §4(ii) tree; every path in `manifest.json` resolves; `README.md` matches the §4(iii) skeleton.
2. The bundle opens on a machine that has never had EXELMJ and is fully self-describing.
3. `.mcpb` installs in one click; `studio_status` responds; `describe_page` returns Markdown; `export_bundle` writes files and returns paths.
4. **No tool result exceeds 900 KB**, asserted by a test. No tool returns image bytes.
5. With EXELMJ closed, the bridge returns "Open EXELMJ first" within 2 s and does not hang.
**Verification.** A conformance test that unzips into a temp dir and validates every reference and checksum. An empirical handshake test against the installed Claude Desktop **before** any v2 SDK migration is considered. Manual install on a clean Windows profile, both MSIX and non-MSIX.

---

## 7. RISKS AND NON-GOALS

### 7.1 Unproven — must be spiked before its milestone is committed

| # | Risk | Why it is real | Spike (timeboxed) | Fallback |
|---|---|---|---|---|
| R1 | **DOM layout oracle fidelity** at fractional pt and high DPI | `getBoundingClientRect()` returns CSS pixels as floats; sub-pixel rounding could drift from PDF export | 1 day: the 40-case matrix in M6, at 100/125/150/200 % Windows scaling | pin the oracle host to `zoom:1` in its own shadow root and read `offsetWidth`-based integers; last resort `yoga-layout@3.2.1` (flex only) |
| R2 | **Claude Desktop's actual MCP protocol revision** | 2026-07-28 removed `initialize` entirely; nothing confirms an older client's behaviour, and nothing confirms a v2 server falls back | 0.5 day: v1 stdio server, log the raw handshake | ZIP is primary precisely so this cannot block delivery |
| R3 | **MSIX config-path trap** | Four separate GitHub issues: the Edit Config button opens one path, the app reads another; `${__dirname}` is reported to resolve to the virtualised path | 0.5 day on a clean profile | installer writes both; `.mcpb` plus a printed manual snippet |
| R4 | **`DOMSnapshot` is an experimental CDP domain** | `getSnapshot` is already deprecated; field shapes can move under an Electron upgrade | ship a fixture smoke test in CI from day one | 8a's offscreen-iframe path is independent of CDP and remains the primary importer |
| R5 | **Font embedding legality** on capture | Many webfonts forbid redistribution; we would be writing them into a ZIP | none — policy: default **off**, explicit tick to include, and the ladder prefers outlining | outline-on-import (step 3) is always available |
| R6 | **`@resvg/resvg-wasm` Arabic shaping** | resvg is not HarfBuzz-grade; complex Arabic with rare ligatures may differ from Chromium | 0.5 day: render 20 Arabic strings both ways, diff | for previews only, fall back to a Chromium off-screen render; `harfbuzzjs` is the escape hatch (cluster indices are what keep shaped RTL text editable) |
| R7 | **`clipper2-ts` is BSL-1.0** | Permissive and BSD-like, but **not literally on our approved list** | one-line legal sign-off (attribution in source only, no binary notice) | we do not currently need it — `paper` is the Bézier-native boolean choice, and Clipper flattens curves by construction |
| R8 | **Iconify mirror staleness** | We consume icon sets through a mirror | cross-check counts at build time (Tabler = 6,184 matches upstream's own README — that exact match is the evidence the mirror is current) | pin the `@iconify/json` version; upgrades are deliberate |

### 7.2 What will be slow, and the accepted answer

| Slow thing | Why | Answer |
|---|---|---|
| Importing a large captured page | one offscreen layout pass over hundreds of nodes | progress UI + cancel; cap at 2,000 nodes and offer "import this subtree only" |
| First trace after launch | WASM/worker cold start | warm the worker at studio init |
| Undo on a heavy document | `captureState()` `JSON.stringify`s the whole document per action | **known debt.** Mitigate by moving image bytes to a content-addressed side table *inside* the document (the Excalidraw `files` idea, applied internally). A command-log undo is the correct long-term fix and is deliberately **not** in this plan — it is a rewrite with no visible feature |
| Live preview strip on a complex icon | 5 resvg renders per commit | debounce 60 ms; render only the sizes currently visible |
| Token change repainting every page | full invalidation | maintain a reverse index token → bound object ids; repaint only those |

### 7.3 Explicit non-goals — we will NOT build these

1. **A second renderer.** No PixiJS, no Fabric.js, no CanvasKit, no `@svgedit/svgcanvas`. Adopting any of them means running two editors with two document models in one page and marshalling every edit across the boundary. **We steal SVG-Edit's selector-grip and path-node maths by reading `select.js` and `path.js`, and throw the engine away.**
2. **A second layout engine.** No Yoga, Taffy, Blitz or Satori on the main thread. We ship Chromium.
3. **A framework.** No React, Vue, Preact, or anything that depends on them — which rules out Craft.js, Puck, `@scena/guides` (ships `croact`), `iro.js` (ships Preact), and `@builder.io/html-to-figma` (ships `react-intl` + Emotion).
4. **A web-app authoring tool.** GrapesJS is the closest thing to the brief and is BSD-3-Clause — but **it has no RTL support**; issue #1122 ("Support RTL", opened May 2018) was closed as outdated and RTL never landed. Against a hard constraint, that ends it.
5. **A `.fig` / `.sketch` importer.** The brief asks us to ingest designs from **websites**, which we already can. A reader built on a reverse-engineered wire protocol invites a dispute over a feature nobody asked for.
6. **Screenshot-based UI recovery (UIED and its class).** We possess the DOM. Guessing element boundaries from pixels when you already have ground truth is strictly worse — and UIED specifically requires a Google Cloud Vision API key, violating "fully offline".
7. **Animation authoring.** Captured `@keyframes` are **preserved and handed off**, never rendered on our canvas. A static design tool that half-plays animations is worse than one that does not.
8. **A component code generator.** No React/Vue/Svelte emit. The optional `code/` folder is plain HTML/CSS/SVG only. If TS emit is ever wanted, `esrap` (MIT, the printer inside the Svelte 5 compiler) is the right choice and `ts-morph`/Babel are not — but Plasmic's file-split discipline (a machine-owned file that is always overwritten, importing a human-owned file that is generated once and never touched) removes the need for AST-preserving reprinting entirely.
9. **A cloud anything.** No account, no API key, no telemetry, no network call at runtime. This is why tldraw is banned outright rather than merely rejected: its licence describes technical measures that "may collect and transmit usage data".
10. **APCA contrast, or the word "APCA" in the UI.** Licence, patents pending, and trademarks. We ship WCAG 2.x and note in the panel that contrast at the dark end is polarity-sensitive — the *insight* is not copyrightable, the code and the name are.
11. **Icon sprite sheets, WOFF2, and web delivery formats.** An offline desktop app has no `<symbol>` sprite and no `woff2`. `ttf2woff2` carries a compiled build step for a format we would never ship.

---

## Summary of the load-bearing decisions

1. **Version 4, extend, side-table hierarchy.** Frames reference leaf ids; the flat arrays and every renderer, exporter and hit-test survive untouched. Old builds refuse a v4 file loudly rather than loading it and silently deleting the design system.
2. **Colour is one library plus 200 vendored MIT lines.** `culori` is the only parser; the Ottosson cusp is ours; contrast is ten in-house lines because every APCA path is AGPL-tainted and patent-encumbered.
3. **We already ship the best layout engine in the world.** The hidden shadow-root DOM oracle is ~120 lines, gives CSS Grid and native RTL for free, and beats every WASM engine in the research.
4. **The picker gives no geometry, so the bridge is a layout run, not a translation.** That is the single fact that shapes section 3, and it was only discoverable by reading `componentJson()`.
5. **ZIP is primary.** It cannot fail to install, has no protocol version risk, no ~1 MB ceiling, and the owner can open it.
6. **`svgpath` normalisation is the one choke point** that turns "traced paths cannot be node-edited" from a rewrite into a one-line pipeline.
7. **Twelve dependencies, nine of them zero-dep, every one verified live against the npm registry this session.** Twelve more deliberately hand-rolled, each with the reason recorded.