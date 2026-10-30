All facts verified. Here is the recommendation.

---

# EXELMJ Studio — Technical Recommendation

**Date:** 2026-08-14 · **Target:** `D:\EXELMJ` v0.3.0 · Electron 43.1.1 · Vite 8.1.5 · vanilla TS, ESM, `type: module`

---

## 0. Headline decision

**Studio is not five features. It is three kernels and four thin views.**

| Kernel | What it owns | Feeds |
|---|---|---|
| **K1 — Doc** | One node + ops protocol, one patch history, adapters to existing stores | (a) (b) (c) (e) |
| **K2 — Frame** | One owned browsing surface (iframe in renderer / `WebContentsView` in main) + device emulation + the single CDP session | (a) (c) (d) |
| **K3 — Probe** | The injected agent: hover overlay, click capture, selector, style diff, node projection | (a) (c) |

The five requested parts are then thin:

- **(a) builder** = K1 + K2(iframe) + K3 + our inspector + our emitters
- **(b) designer** = five surgical additions to the existing `src/design/*`, expressed as K1 ops
- **(c) picker** = K3 + K2, reporting into K1 — *the picker is an importer into the same model*
- **(d) mini-browser** = K2(`WebContentsView`) + a device bar
- **(e) MCP** = a thin RPC facade over K1's op protocol

This is what makes "one model, three views" real rather than aspirational: **the builder's "click an element in my canvas" and the picker's "click an element in a running app" are literally the same code**, because both are K3 running inside a K2 frame writing into K1.

**Total new dependency cost: 7 runtime packages, 1 dev package, 3 vendored files.** Six of the seven have zero transitive dependencies.

---

## 1. Findings from this session that change the plan

I read the actual codebase and re-verified the load-bearing external facts. Six things differ from the research inventory and each one changes a decision.

**1.1 — `mrflix/Alignment-Guides` has NO licence. Do not copy it.**
The inventory says "MIT (confirmed)". GitHub's API reports `license: null`, and the repo root contains only `README.markdown`, `index.html`, `js/`, `screen.png` — `LICENSE`, `LICENSE.md`, `license`, `license.txt` all return 404, and the README contains no licence statement. Absent an explicit grant, default copyright applies. **We implement smart guides ourselves** from the described algorithm (an algorithm is not copyrightable; the code is).

**1.2 — Our tracer already does colour. Drop VTracer and ImageTracerJS entirely.**
`src/design/trace.ts` (729 lines) documents a four-stage pipeline: variance-cut palette quantisation → stacked layers (Inkscape "stack scans") → soft-membership sub-pixel iso-contours via marching squares → corner detection + least-squares cubic fit, plus per-region linear-gradient fitting (`gradientFit.ts`) and centreline mode (`centerline.ts`). `TracedPath` already carries `fill` and `gradient`. Adding either recommended colour tracer would be a **downgrade**, not an upgrade. This removes two dependencies from the plan.

**1.3 — The potrace/GPL provenance concern is RESOLVED.**
`trace.ts` header states verbatim: *"our own implementation, no third-party tracer"*. A grep across `src/` for `potrace|selinger|GPL|derived from` returns nothing. Record this in `PROJECT_MAP.md` so it is never re-raised.

**1.4 — MCP stdio transport is structurally impossible from a `utilityProcess`.**
Electron docs, verified verbatim: *"Configuring `stdin` to any property other than `ignore` is not supported and will result in an error."* Also *"utilityProcess.fork can only be called after the `ready` event has been emitted on `App`."* Therefore **Streamable HTTP on 127.0.0.1 is mandatory**, not a preference. Any design assuming stdio is dead on arrival.

**1.5 — `node_modules` is not packaged. The MCP server must be bundled.**
`electron-builder.yml` ships only `dist/**`, `dist-electron/**`, `package.json`. `scripts/build-electron.mjs` esbuild-bundles exactly two entry points. The MCP server entry must be added as a **third entry point** producing `dist-electron/mcpServer.cjs`, or `npm run dist` produces an app whose MCP server cannot resolve its own SDK.

**1.6 — `Shape` has no rotation field. Rotate handles require a schema bump.**
`src/design/shapes.ts`: `Shape { id, kind, x, y, w, h, fill, stroke, strokeWidth, d?, gradient? }`. No `rotation`, no transform. `PlacedImage` has no crop rect. The sidecar is `DesignProject v3` persisted to `<file>.exelmj.json`. Rotate + crop therefore require **v3 → v4 with forward-compatible reads** (a v3 file parses as `rotation: 0`, `crop: undefined`). This must be planned, not discovered.

**1.7 — Existing undo is a serialized-snapshot stack with one choke point.**
`designApp.ts:2648` — *"ONE choke point where history can be captured — the state BEFORE the action"*, `undoStack: string[]`, capped at 40. This is good news: the op layer plugs into the existing choke point rather than replacing it.

---

## 2. Part (a) — Visual UI builder

### Approach: **DOM-truth builder**

The canvas is a **same-origin iframe whose document *is* the output**. We render `StudioDoc` → real DOM. Chromium does layout, CSS, fonts and Arabic shaping — we never reimplement any of it. Selection and drag come from K3. The inspector and the emitters are ours.

### Why NOT GrapesJS (overruling the sweep's #1 ADOPT)

GrapesJS is BSD-3, active, framework-free and genuinely excellent. I am rejecting it for three reasons, in order of weight:

1. **It brings its own document model and its own `UndoManager`.** Adopting it means (a) lives in GrapesJS's Component tree while (b) lives in ours — two models, two histories, two serializers, two MCP tool families. That directly negates the stated goal of one model / three views, which is the entire architectural value of this project.
2. **Its output is HTML/CSS pages, not "code we own."** We would still write an emitter, and that emitter would read GrapesJS's model rather than ours. We pay the dependency and still write the hard part.
3. **It owns the UI chrome.** In an Arabic-RTL-first app with an existing hand-built panel language, that is a large, permanent styling and localisation liability — and the sweep's own note concedes *"RTL/Arabic in the canvas is your problem."*

**What we take from it instead** (verified from `packages/core/src/canvas/config/config.ts` on `dev`): the `frameContent` / `frameStyle` pattern. GrapesJS's defaults are `frameContent: '<!DOCTYPE html>'` and a small `frameStyle` string, both written into the iframe on load. We do exactly this, but with `<!DOCTYPE html><html dir="rtl" lang="ar">` and an `@font-face` block pointing at bundled Arabic fonts. **Owning the iframe's doctype and root attributes is the entire RTL story for the builder canvas.**

### Layout and style policy — the Arabic-first decision

**Logical CSS properties only.** `inset-inline-start`, `margin-inline`, `padding-block`, `text-align: start`, `border-inline-end`. Physical `left`/`right`/`margin-left` are **banned in emitted code and in Studio's own CSS**, enforced by a lint rule.

Rationale: this fixes RTL at the source instead of bolting on an `rtlcss` post-pass over generated output. It also sidesteps the verified web-platform gotcha that **`:dir()` is semantic-only — CSS `direction: rtl` alone does not trigger it.** Direction is therefore expressed *exclusively* as `dir` on the root element, never as a CSS property, and every mechanism (our components, our emitted code, the iframe) keys off that one attribute.

### Emit targets (v1)

| Target | Output | Contract |
|---|---|---|
| `html` | one self-contained `.html` + `.css` | `#studio-root` wrapper with direct `<section>` children; **zero builder attributes survive** |
| `vanilla-ts` | `Component.ts` exporting `mount(el, props)` + `Component.css` | matches EXELMJ's existing module style |
| `tokens-css` | DTCG JSON → CSS custom properties | one token file, both views consume it |

The clean-emit rule is stolen from Instatic's stated guarantee — *plain semantic HTML and compact CSS, with none of the editor's machinery left behind*. The `#studio-root` + direct-`<section>` persistence contract is stolen from `@myissue/vue-website-page-builder`. Both are ideas, not code.

**No React or Vue emitter in v1.** React 19 exists in the tree only because `@univerjs/presets` needs it; we do not build React apps.

### Dependencies

**None.** The builder adds zero npm packages.

### Hand-rolled

- `builder/builderView.ts` — StudioDoc → DOM renderer, `data-studio-id` stamping
- `builder/palette.ts` — our component registry
- `builder/inspector/*` — property panel
- `builder/emit/*` — three emitters + the stamp/strip pass

### Techniques borrowed

| From | Technique |
|---|---|
| GrapesJS (BSD-3) | `frameContent`/`frameStyle` iframe injection; **SelectorManager's explicit edit-target chip** — the user sees and picks *which rule* a style edit lands in (inline / this element's class / a new class) before editing. Without this, an AI will silently write inline styles that permanently override the user's stylesheet. |
| Tencent tmagic-editor (Apache-2.0) | one schema, many runtimes — the designer only ever produces schema; each emitter is a swappable back end |
| `@compai/css-gui` (MIT) | the property → control mapping table, taken as **data**, hand-mapped to ~40 properties for v1 |
| tweakpane (MIT) | the control-plugin contract `{ accept, binding: { reader, writer, constraint }, controller }` — copied as a shape, not installed |
| OpenChakra (MIT, abandoned) | always-visible live generated-code panel beside the canvas — the cheapest way to make a builder feel like it produces real code |
| FigmaToCode (**GPL-3.0 — READ ONLY**) | absolute-position → flex/stack layout inference. **Reference/inspiration only. No code copied. Must be labelled as such in `PROJECT_MAP.md`.** |

---

## 3. Part (b) — Vector designer: what to ADD

Five named gaps, five surgical additions. Nothing existing is rebuilt.

### 3.1 Resize / rotate handles → **hand-rolled** (`vector/transformer.ts`)

Requires `Shape.rotation: number` (radians, about the shape centre) → **sidecar v3 → v4**, forward-compatible.

Borrow **Konva.Transformer's specification** (not its code — it is a Konva `Node` and cannot be used without adopting Konva's `Stage`/`Layer`): 8 directional anchors, `resizeEnabled`/`rotateEnabled`, `rotationSnaps` with an angular tolerance, `keepRatio`, `centeredScaling`, `flipEnabled`, `enabledAnchors`, `padding`, `anchorSize`, `rotateAnchorOffset`, and the `transformstart`/`transform`/`transformend` event triple.

**Rejected:** `moveable` (its "vanilla" package pulls `react-moveable` + `croact` + `croact-moveable` — a virtual-DOM layer), `interactjs` (we already own pointer handling and canvas hit-testing), Konva, Fabric.

**RTL note:** the gizmo operates in document space, not layout space. It must not mirror under `dir="rtl"`.

### 3.2 Smart guides → **hand-rolled** (`vector/guides.ts`)

Collect candidate edges and centres from sibling shapes on the page → bucket them within a pixel tolerance → draw the guide line and snap. ~200 lines.

**Licence correction (see §1.1): do not copy `mrflix/Alignment-Guides`.** It has no licence file.

### 3.3 Image crop UI → **hand-rolled** (`vector/crop.ts`)

Reuses the §3.1 transformer with a second, inner handle set. `PlacedImage` gains `crop?: { sx, sy, sw, sh }` (source rect) and rendering switches to the 9-argument `drawImage`. Sidecar v4.

### 3.4 Non-blocking tracing + live preview → **Web Worker** (`vector/traceWorker.ts` + `traceClient.ts`)

**This is the single highest-value item in (b)**, because it unblocks live preview *and* makes the tracer callable from MCP without freezing the app.

`trace.ts` is already pure — *"no canvas, no DOM — so the whole tracer is unit-testable in node"*. It moves into a Worker unchanged. Vite 8 handles `new Worker(new URL('./traceWorker.ts', import.meta.url), { type: 'module' })` natively; no plugin, no config change.

Two-pass protocol:
- **Pass 1 (preview):** ≤25% resolution, coarse palette → first paint target **<150 ms**
- **Pass 2 (final):** full resolution, posted incrementally by layer

Every parameter change carries a monotonically increasing `jobId`; the client discards results from superseded jobs and the worker checks the token between layers. Zero dependencies.

### 3.5 Re-colourable + node-editable traced paths

**Re-colour is almost free.** `Shape { kind: 'path' }` already carries `fill`, `stroke`, `strokeWidth` and `gradient` in the same local-pt space as `d`. The gap is purely that the inspector does not expose them for `kind === 'path'`. Wire the existing controls. ~40 lines.

**Node editing needs two libraries:**

| Package | Version | Licence | Deps | Why |
|---|---|---|---|---|
| `svg-path-editor-lib` | 1.0.4 | Apache-2.0 | **none** | parse `d` → typed commands; insert/delete/move nodes; abs↔rel; transforms; coordinate rounding. Extracted from the Yqnn SVG Path Editor, so the algorithms are proven by a shipping app. Repo active (pushed 2026-06-18). |
| `bezier-js` | 6.1.4 | MIT | **none** | `project(point)` → **click-to-select-a-path** and **insert-node-at-click-position**, the two core interactions of a path editor. Also curve/line intersection for marquee selection, and `outline`. Authored by Pomax, backed by the Primer on Bézier Curves. |
| `svgpath` | 2.6.0 | MIT | **none** | `arcToCurve` normalisation. Our tracer emits cubics, but an *imported* SVG can carry elliptical arcs, which are a notorious source of hand-rolled path bugs in export. Cheap insurance for the PDF/SVG export path. |

**Optional, verification-only:** vendor `fit-curve@0.2.0` (MIT, zero deps) for a **one-time numerical diff** against `src/design/curveFit.ts` — it is the canonical port of Schneider's *Graphics Gems* algorithm. Adopt only if ours measures worse. Not a shipped dependency by default.

**Optional, deferred:** `svg-path-properties@2.0.2` (ISC, zero deps) — DOM-free `getTotalLength`/`getPointAtLength`, needed only when the MCP server (which has no DOM) must measure paths.

---

## 4. Part (c) — AI element picker (greenfield)

`E:\AI-Element-Picker` is empty. This is a clean design.

### Approach: **injected probe, not CDP**

The decisive reason, verified this session from Electron's `debugger` documentation: the debugger's `detach` event fires *"when `webContents` is closed or DevTools is invoked for the attached `webContents`."* **Opening DevTools on the preview forcibly detaches our debugger.** A CDP-based picker dies the moment a developer opens DevTools — which is precisely when they are most likely to use it. Compounding this, the CDP `Overlay` domain carries an *Experimental* marker at the domain level.

So: an injected script owns hover, highlight, click and capture. CDP is used **only** for things it uniquely provides (touch emulation, UA override, `prefers-color-scheme`), never on the critical path, and always with graceful degradation.

### The probe (`src/studio/probe/`)

One bundle, one IIFE, injected identically into the builder iframe (`<script>`) and the mini-browser (`webContents.executeJavaScript`).

| Capability | Implementation |
|---|---|
| **Hover highlight** | Hand-rolled. DevTools-grade four-quadrant box-model shading (content / padding / border / margin), rendered in a **closed shadow root** on a `position: fixed` host so the inspected page's CSS cannot reach it. Direction-neutral. Borrowed from the CDP `Overlay.HighlightConfig` model and eruda's overlay. |
| **Click capture** | Alt+Click by default, matching the `click-to-component` / MCP Pointer convention. `capture: true`, `preventDefault`, `stopPropagation`. |
| **Selector** | **Vendor `finder.ts` from master** — MIT, single file, **9,450 bytes**, verified. Master contains shadow-root support (`getRootNode`, `ShadowRoot` at lines 335–337) that **npm 4.0.2 does not ship**. Vendored to `probe/vendor/finder.ts` with its MIT header intact and a `VENDOR.md` provenance note. |
| **Ranked selectors** | Hand-rolled ranking on top of finder: `data-testid` > `id` > `role`+accessible-name > text > CSS path. **Return the ranked list, not one winner** — stolen from Selenium IDE's recorder and Playwright's `selectorGenerator` scoring. An LLM reasons far better about `getByRole('button', { name: 'حفظ' })` than about `div > div:nth-child(3)`. |
| **Style capture** | Hand-rolled reference-iframe default-diff, ~40 lines. `getComputedStyle` returns ~340 properties; dumping them at a model is a token bonfire. Create one hidden `<iframe sandbox>` that inherits no page CSS, instantiate one bare element **per tag name**, cache the reference styles per tag, and diff. Returns only what the author actually set. |
| **Matched rules** | Hand-rolled: walk `document.styleSheets` → `CSSRule.selectorText` → `el.matches(sel)` → order by specificity. Algorithm stolen from **eruda** (MIT). ~120 lines. |
| **Specificity** | Hand-rolled `(a,b,c)` counting. `@bramus/specificity` is MIT and correct but drags `css-tree ^3` into a bundle we inject into the user's page. Noted as the fallback if `:is()`/`:where()`/`:not()` edge cases actually bite. |
| **Source coordinates** | For projects **our** emitter generated, read `data-studio-src="file:line:col"`. Three-stage architecture stolen from `react-dev-inspector` and `code-inspector-plugin`: build-time stamp → runtime read → main-process resolve. No source-map arithmetic. For third-party projects, `source: null`. |

### Screenshot: `capturePage(rect)`, **not snapdom**

`webContents.capturePage(rect)` in the main process, using the element's device-pixel rect. This is the real Chromium compositor: **zero injected bytes, zero dependencies, and perfect Arabic shaping and font rendering by construction.** `@zumer/snapdom` (387 KB, must run inside the page, must embed `@font-face` to avoid tofu) is noted only as a fallback for occluded or off-screen elements. **Not installed.**

### Wire format

**Adopt CDP's `CSS.getMatchedStylesForNode` response shape verbatim** — `{ inlineStyle, attributesStyle, matchedCSSRules: [{ rule, matchingSelectors }], inherited[], pseudoElements }` — extended with `{ selectors: Ranked[], box, a11y, source, screenshotRef }`.

Rationale: it is a battle-tested, JSON-serialisable contract for "everything one needs to know about one element", every DevTools-shaped tool already speaks it, and it goes down the MCP wire unchanged. Screenshots travel as **resource handles**, never inlined base64 — stolen from `pulsemcp/svg-tracer`'s return discipline and Figma's separate asset endpoint.

### Open in editor

`launch-editor@2.14.1` — MIT, deps `picocolors ^1.1.1` + `shell-quote ^1.8.4`, **main process only**. Pin `>=2.14.1`: that release rejects UNC paths to prevent NTLM credential leakage (GHSA-v6wh-96g9-6wx3), which matters because EXELMJ is Windows-first. Its running-process detection beats hardcoding `vscode://`. Only ever called with paths inside the currently opened project.

### The third view

`PickPayload → projectToNode()` produces a `StudioNode`. **The picker is an importer into the same model** — this is what makes it the third view rather than a bolted-on inspector.

### Explicitly not installed

`bippy`, `react-dev-inspector`, `@locator/runtime`, `css-selector-generator`, `js-element-picker`, `pick-dom-element`, `snapdom`, `modern-screenshot`, `browser-tools-mcp`, `chrome-devtools-mcp`, `@playwright/mcp`.

---

## 5. Part (d) — Embedded mini-browser

### Surface: `WebContentsView`

Verified current, not deprecated: `new WebContentsView([options])`, extends `View`, main process only, *"cannot be used until the `ready` event of the `app` module is emitted"*, and *"Electron's built-in classes cannot be subclassed in user code."*

**Not `<webview>`** — Electron's own docs recommend against it (*"undergoing dramatic architectural changes… we currently recommend to not use the webview tag"*). **Not `BrowserView`** — deprecated since Electron 29/30, fourteen majors behind.

### The consequence nobody plans for

**A `WebContentsView` is an OS-level layer composited *above* the renderer. CSS cannot clip, round, rotate or z-order it.**

Three concrete implications:
1. **No CSS device bezels around it.** We draw a chrome frame *around* its bounds in the renderer, never a mask over it. `devices.css` (picturepan2, MIT, verified) is **deferred** — it can only ever decorate the iframe surface, not this one.
2. **Bounds must be synchronised manually** on every window resize, panel toggle, sidebar collapse and scroll. Budget for this; it is the main source of bugs in this part.
3. v1 ships a **bezel-less viewport with a size chip** (`1280 × 720`), not a photoreal phone frame.

### Device switching

`webContents.enableDeviceEmulation({ screenPosition, screenSize, viewPosition, deviceScaleFactor, viewSize, scale })` — first-party, one call, no dependency. `scale` is **visual only and does not change the layout viewport**, which is exactly what zoom-to-fit needs.

Touch points, UA string and `prefers-color-scheme` need CDP (`Emulation.setTouchEmulationEnabled`, `setUserAgentOverride`, `setEmulatedMedia`) via `webContents.debugger`. These go through a **single `CdpSession` owner per view** (`electron/studio/cdpSession.ts`) because attach is exclusive and DevTools steals it. If attach fails, viewport switching still works — the degradation is graceful and silent.

### Device catalogue — **vendored**

`deviceDescriptorsSource.json` from `playwright-core`, Apache-2.0. Verified live: **HTTP 200, 80,785 bytes, 207 top-level keys**, schema `{ userAgent, screen?, viewport{width,height}, deviceScaleFactor, isMobile, hasTouch, defaultBrowserType }`. Ignore `defaultBrowserType` — we are always Chromium.

Sample verified entries:
- `Desktop Chrome` → viewport 1280×720, dsf 1, `isMobile: false`
- `iPad Pro 11` → viewport 834×1194, dsf 2, touch
- `iPhone 15` → viewport 393×659, dsf 3, touch

Ship the whole file, **surface three by default** behind the three icons, with the remaining 204 behind a picker. The MINIMAL-vs-FULL split is stolen from Storybook's viewport addon; we take the idea, not the package (installing Storybook for ~200 lines of constants would be indefensible).

### Icons — **vendored**

Five Lucide SVGs, ISC, each verified HTTP 200 on `main`: `monitor.svg`, `tablet.svg`, `smartphone.svg`, `laptop.svg`, `monitor-smartphone.svg`. Copy the files into `src/studio/browser/icons/`. **No npm dependency** — the `lucide` package is 20 MB unpacked across 3,562 files for a DOM scanner we do not want.

### Running the project

**`vite.createServer()` in-process.** Vite 8.1.5 is already a dependency, the API is documented at v8.2.1 (`createServer`, `middlewareMode`, `server.middlewares`, `transformIndexHtml`, `preview()`), it gives HMR for free, and it costs **zero new packages**. The server runs in the Electron main process (or in the MCP utilityProcess); the view points at `http://127.0.0.1:<port>`.

`electron-serve@3.0.1` (MIT, zero deps, requires Electron ≥37 — we are on 43) is **deferred** to the milestone where we preview a *built* `dist`.

### Explicitly not built

X-Frame-Options / CSP `frame-ancestors` stripping (we run our own projects, not third-party sites — and stripping it process-wide disables clickjacking protection); a simultaneous multi-viewport grid; general web browsing; WebContainers / Sandpack / Nodebox / `esbuild-wasm` browser bundling — **we have a real Node runtime and a real Vite; a browser VM is strictly worse and, in WebContainers' case, requires a paid commercial licence for for-profit production use.**

---

## 6. Part (e) — MCP server

### SDK: the v2 split, targeting spec revision 2026-07-28

| Package | Version | Licence | Deps (verified) |
|---|---|---|---|
| `@modelcontextprotocol/server` | 2.0.0 | MIT | `zod ^4.2.0`, `@modelcontextprotocol/core 2.0.0` |
| `@modelcontextprotocol/core` | 2.0.0 | MIT | `zod ^4.2.0` |
| `zod` | `^4.2.0` | MIT | — (declared directly so we do not resolve a duplicate) |

Both ESM (`type: module`), `engines: node >= 20`. This is a dramatically cleaner graph than v1's `@modelcontextprotocol/sdk@1.30.0`, which drags ~17 transitive packages including **both** `express ^5.2.1` **and** `hono ^4.11.4`.

**Design against 2026-07-28, not against tutorials.** That revision is stateless: the `initialize`/`notifications/initialized` handshake is **removed**, `Mcp-Session-Id` is **removed**, every request carries `protocolVersion` + `clientCapabilities` in `_meta`, servers **MUST** implement `server/discover`, every result needs a required `resultType`, `ping` / `logging/setLevel` are removed, and Roots / Sampling / Logging are deprecated. Any design assuming a stateful handshake is already obsolete.

### Hosting: `utilityProcess.fork` + Streamable HTTP on loopback

```
Claude ──HTTP──▶ 127.0.0.1:<port>  [utilityProcess: mcpServer.cjs]
                        │ MessagePortMain
                        ▼
                  Electron main
                        │ ipcMain.handle('studio:*')
                        ▼
                  Renderer  →  K1 Doc  →  builder / designer / probe
```

- `utilityProcess.fork` **after `app.ready`** (verified hard constraint)
- **Streamable HTTP, not stdio** — stdin cannot be configured (§1.4)
- utilityProcess ⇄ main via `MessagePortMain`; main ⇄ renderer via the existing `ipcMain.handle('domain:verb', …)` house style, extended as `studio:*`
- **Bundled** as a third esbuild entry point → `dist-electron/mcpServer.cjs`, `external: ['electron']` (§1.5)

### Security topology — stolen from Figma, hardened

Figma's Dev Mode server runs at `http://127.0.0.1:3845/mcp`, enabled by an explicit in-app toggle. We copy the topology and add two things:

1. **Bind 127.0.0.1 only**, **off by default**, behind a user-facing toggle in Settings
2. **Ephemeral port + a per-session bearer token** required on every request, written to a lockfile in `app.getPath('userData')`. An open debug/RPC port on localhost is open to every process on the machine; the token idea is borrowed from `chrome-devtools-mcp`'s `--wsHeaders`.

### Tool-surface philosophy: **Penpot's shape, without the eval hazard**

Penpot's official in-repo MCP server (MPL-2.0) replaces a wall of fine-grained tools with a code-execution bridge: a small tool surface, and the LLM writes snippets that run inside the plugin with a live handle to the document. That collapses ~80 hand-written schemas to a handful and lets the model compose multi-step edits atomically instead of chattering over dozens of round-trips.

**We take the shape and reject the mechanism.** Arbitrary JS evaluated in our renderer is a serious security surface (the same objection that makes `blender-mcp`'s arbitrary-Python tool unshippable). Instead, `studio_apply` accepts an **array of typed `StudioOp`s** — the very same union the undo system uses. Same atomicity, same tiny tool count, no `eval`.

### Dev-time only

`@modelcontextprotocol/inspector@2.2.0` (MIT) via `npx` — a devDependency, never bundled, non-negotiable for developing against a spec revision this new.

### Deferred / rejected

- `@anthropic-ai/mcpb@2.1.2` (MIT) — `.mcpb` one-click bundle. Build-time only, zero runtime cost. Add when we want installability, not before.
- `@modelcontextprotocol/ext-apps` (MCP Apps / SEP-1865) — **blocked today.** It peer-depends on `@modelcontextprotocol/sdk ^1.29.0`, the v1 line, which conflicts with `server@2.0.0`. Anthropic's own Inspector works around this by *also* pulling `server-legacy`. Revisit when ext-apps lands on v2.
- `supergateway` — dormant ~10 months, `express 4`, and its main feature bridges to a transport the spec just deprecated. We control both ends of the pipe; we do not need it.

---

## 7. Complete dependency ledger

### New runtime packages — **7**

| Package | Version | Licence | Transitive deps | Where | Justification |
|---|---|---|---|---|---|
| `svg-path-editor-lib` | 1.0.4 | Apache-2.0 | **0** | renderer | Path node editing. Pure logic, no DOM, no framework. The one thing we genuinely cannot get for free. |
| `bezier-js` | 6.1.4 | MIT | **0** | renderer | `project(point)` → click-to-select-path and insert-node-at-click. The two core path-editor interactions. |
| `svgpath` | 2.6.0 | MIT | **0** | renderer | `arcToCurve`. Removes an entire bug class from SVG import/export. |
| `@modelcontextprotocol/server` | 2.0.0 | MIT | core, zod | utilityProcess | The protocol. Only correct choice for new code in Aug 2026. |
| `@modelcontextprotocol/core` | 2.0.0 | MIT | zod | utilityProcess | Peer of the above. |
| `zod` | ^4.2.0 | MIT | 0 | utilityProcess | Tool input schemas. Range matched to the SDK's own to avoid duplication. |
| `launch-editor` | 2.14.1 | MIT | picocolors, shell-quote | main | Open-in-editor with running-process detection. Windows-correct. Pin ≥2.14.1 (UNC/NTLM fix). |

### New dev packages — **1**

| Package | Version | Licence | Justification |
|---|---|---|---|
| `@modelcontextprotocol/inspector` | 2.2.0 | MIT | `npx` only, never bundled. Required to develop against spec 2026-07-28. |

### Vendored source — **3**

| Artefact | Source | Licence | Size | Why vendored not installed |
|---|---|---|---|---|
| `probe/vendor/finder.ts` | `antonmedv/finder@master` | MIT | 9,450 B | Master has shadow-root support; npm 4.0.2 does not. Single file. |
| `frame/vendor/deviceDescriptorsSource.json` | `playwright-core` | Apache-2.0 | 80,785 B, 207 keys | Plain data. Installing `playwright-core` for a JSON file is absurd. |
| `browser/icons/*.svg` | `lucide-icons/lucide@main` | ISC | 5 files | The npm package is 20 MB for a DOM scanner we do not want. |

### Deferred, decided but not now

`electron-serve@3.0.1` (built-dist preview) · `@anthropic-ai/mcpb@2.1.2` (installer bundle) · `svg-path-properties@2.0.2` (DOM-free measurement for MCP) · `devices.css` (iframe bezels only) · `fit-curve@0.2.0` (one-time algorithm diff) · `rbush@4.0.1` (spatial index — only when hit-testing measurably degrades) · `culori@4.0.2` (only when CSS Color 4 round-trip is needed) · `postcss@8.5.26` + `magic-string@1.2.0` + `oxc-parser@0.144.0` (only for round-trip write-back, §12)

---

## 8. The shared data model — one model, three views

### Design principle

**One model, three views** does **not** mean one file format. `DesignProject v3` already exists on disk in ~every user sidecar, in PDF points, per page. Rewriting it would be a rewrite, not an addition, and would break every existing `.exelmj.json`.

**The unification is at the node-and-ops layer, not the file layer.** Three stores, one protocol.

```ts
// src/studio/doc/types.ts

type NodeId = string            // 'n_' + monotonic counter, stable for the doc's life
type StoreId = 'studio' | 'design'   // which backing store a node lives in

// ── Nodes ────────────────────────────────────────────────────────────
interface NodeBase {
  id: NodeId
  parent: NodeId | null
  name: string                  // user-visible, shown in the layers panel
  visible: boolean
  locked: boolean
  style: StudioStyle            // ONE style representation for all three views
  dir?: 'rtl' | 'ltr'           // per-node override; inherits from doc
  source?: { file: string; line: number; column: number } | null
  ext?: Record<string, unknown> // lossless round-trip bag (ag-psd lesson):
                                // anything an importer did not understand is
                                // preserved here and written back on export
}

// Surface kinds — the UI-builder view
interface ElementNode   extends NodeBase { kind: 'element'; tag: string; attrs: Record<string,string>; text?: string }
interface ComponentNode extends NodeBase { kind: 'component'; ref: string; props: Record<string, unknown> }
interface SlotNode      extends NodeBase { kind: 'slot'; slotName: string }

// Vector kinds — the designer view (project DesignProject v3/v4)
interface PathNode   extends NodeBase { kind:'path';   d: string; box: Box; rotation: number; gradient?: LinearGradient }
interface ShapeNode  extends NodeBase { kind:'rect'|'ellipse'|'line'|'arrow'; box: Box; rotation: number }
interface TextNode   extends NodeBase { kind:'textbox'; runs: BidiRun[]; box: Box; rotation: number }
interface ImageNode  extends NodeBase { kind:'image';  src: AssetId; box: Box; rotation: number; crop?: Rect }

// Shared container — the hinge that makes one model work for both views
interface FrameNode extends NodeBase { kind: 'frame'; box: Box; profile: 'page' | 'artboard' | 'viewport' }

type StudioNode =
  | ElementNode | ComponentNode | SlotNode
  | PathNode | ShapeNode | TextNode | ImageNode
  | FrameNode

// ── Document ─────────────────────────────────────────────────────────
interface StudioDoc {
  id: string
  version: 1
  store: StoreId                // which adapter backs it
  dir: 'rtl' | 'ltr'            // SINGLE source of truth; never CSS `direction`
  lang: string                  // 'ar' | 'en'
  unit: 'pt' | 'px'             // designer = 'pt' (existing contract), builder = 'px'
  root: NodeId
  nodes: Record<NodeId, StudioNode>   // FLAT store — O(1) addressing for picker + MCP
  order: Record<NodeId, NodeId[]>     // children by parent id — cheap reparent/reorder
  tokens: DtcgTokens                  // W3C DTCG format
  assets: Record<AssetId, Asset>
}
```

**Why flat + id-tree rather than nested objects:** patch paths become `nodes/<id>/style/fill` — short, stable, and unaffected by reordering. Deep array indices break under a single move. This is Cambalache's *"store the design as a queryable database, not a document blob"* lesson, which is what makes undo, cross-references, renames and diffing fall out naturally.

### The style representation — the hinge that makes this work

```ts
type TokenRef = `{${string}}`              // '{color.brand.9}'
type StyleValue = string | number | TokenRef

interface StudioStyle {
  [cssProperty: string]: StyleValue        // LOGICAL properties only
}
```

**A flat CSS-property map, using logical properties, with token references as values.**

This one choice is what makes "one model, three views" real:

- the **builder** needs real CSS — it gets it directly
- the **designer**'s fill / stroke / stroke-width / opacity / blend map onto CSS+SVG property names 1:1 (`fill`, `stroke`, `stroke-width`, `opacity`, `mix-blend-mode`)
- the **picker** returns computed CSS — **so its output is directly assignable into a node's style with no translation layer**

Without this, the picker's payload would need a bespoke converter per view and the "one model" claim would be marketing.

### Ops — one format, three uses

```ts
type StudioOp =
  | { op:'insert';   parent: NodeId; index: number; node: StudioNode }
  | { op:'remove';   id: NodeId }
  | { op:'move';     id: NodeId; parent: NodeId; index: number }
  | { op:'reorder';  parent: NodeId; from: number; to: number }
  | { op:'setProp';  id: NodeId; path: string; value: unknown }
  | { op:'setStyle'; id: NodeId; property: string; value: StyleValue | null }
  | { op:'setPath';  id: NodeId; d: string }
  | { op:'setToken'; path: string; value: unknown }

function applyOps(doc: StudioDoc, ops: StudioOp[], meta: OpMeta):
  { doc: StudioDoc; inverse: StudioOp[] }
```

The same `StudioOp[]` is: the **undo record**, the **MCP wire format**, and the **renderer's dirty-marking input**. One format, three uses.

### History

Hand-rolled on `applyOps` + `inverse`. Three behaviours stolen from Loro's `UndoManager` — **the library is rejected (a 3.18 MB wasm blob for a feature we do not need), the three knobs are copied:**

1. **merge interval** — a continuous drag coalesces into one undoable step
2. **origin exclusion** — selection changes, zoom and tool switches never enter the stack
3. **`onPush`/`onPop` metadata** — each step carries the selection to restore

These three are the difference between undo that feels professional and undo that feels broken, and the existing snapshot stack has none of them.

### Adapters — how the existing designer joins without being rewritten

```
src/studio/doc/adapters/
  designProject.ts   DesignProject v3/v4  ⇄  StudioNode[]   (file format UNCHANGED)
  dom.ts             StudioNode[]         →  real DOM       (builder render)
  pick.ts            PickPayload          →  StudioNode     (picker import)
```

`designProject.ts` projects `TextBox` → `TextNode`, `Shape` → `ShapeNode`/`PathNode`, `PlacedImage` → `ImageNode`, and each page → a `FrameNode{ profile: 'page' }`. Applying ops writes back through `designApp`'s **existing single history choke point** (`designApp.ts:2648`). The sidecar keeps its own schema and its own version number.

**Result: MCP, the picker and the layers panel address the vector designer and the UI builder through one uniform surface, and not one line of the persisted format changes** (beyond the additive v4 `rotation`/`crop` fields).

---

## 9. Folder layout

```
D:\EXELMJ\src\studio\
├─ index.ts                          Studio entry; mounts into the existing shell
├─ studio.css                        panel chrome; logical properties only
│
├─ doc\                              ── K1: the model ──
│  ├─ types.ts                       StudioNode / StudioDoc / StudioStyle / StudioOp
│  ├─ ops.ts                         applyOps(), invert(), typed op constructors
│  ├─ history.ts                     merge interval · origin exclusion · selection meta
│  ├─ tokens.ts                      DTCG load / resolve / alias {group.token}
│  └─ adapters\
│     ├─ designProject.ts            DesignProject v3/v4 ⇄ StudioNode
│     ├─ dom.ts                      StudioNode → real DOM
│     └─ pick.ts                     PickPayload → StudioNode
│
├─ frame\                            ── K2: browsing surfaces ──
│  ├─ frameHandle.ts                 ONE interface over iframe + WebContentsView
│  ├─ iframeFrame.ts                 builder canvas (renderer side)
│  ├─ devices.ts                     MINIMAL(3) / FULL(207) split
│  └─ vendor\deviceDescriptorsSource.json      (Apache-2.0, vendored)
│
├─ probe\                            ── K3: the injected agent ──
│  ├─ probe.ts                       bundle entry → single IIFE
│  ├─ overlay.ts                     box-model highlight, closed shadow root
│  ├─ styleDiff.ts                   reference-iframe default diff
│  ├─ matchedRules.ts                styleSheets walk + specificity
│  ├─ selectors.ts                   ranked candidates over finder
│  ├─ protocol.ts                    PickPayload (CDP getMatchedStylesForNode shape)
│  └─ vendor\finder.ts               (MIT, vendored from master) + VENDOR.md
│
├─ builder\                          ── view 1 ──
│  ├─ builderView.ts
│  ├─ palette.ts                     our component registry
│  ├─ inspector\
│  │  ├─ inspector.ts
│  │  ├─ controls.ts                 tweakpane-shaped control registry
│  │  └─ propertyMap.ts              property → control table (~40 props v1)
│  └─ emit\
│     ├─ html.ts                     #studio-root + <section>, zero editor residue
│     ├─ vanillaTs.ts                mount(el, props) module + .css
│     ├─ tokensCss.ts                DTCG → CSS custom properties
│     └─ stamp.ts                    data-studio-id / data-studio-src inject + strip
│
├─ vector\                           ── view 2: ADDITIONS to src/design ──
│  ├─ transformer.ts                 8 anchors + rotate (Konva.Transformer spec)
│  ├─ guides.ts                      smart guides — OUR implementation
│  ├─ crop.ts                        image crop UI (reuses transformer)
│  ├─ pathEdit.ts                    svg-path-editor-lib + bezier-js
│  ├─ traceWorker.ts                 worker entry, wraps src/design/trace.ts
│  └─ traceClient.ts                 jobId cancellation + two-pass live preview
│
├─ browser\                          ── view 3 ──
│  ├─ browserView.ts                 renderer chrome + bounds sync
│  ├─ deviceBar.ts                   the 3 icons + full picker
│  └─ icons\*.svg                    5 Lucide glyphs (ISC, vendored)
│
└─ mcp\
   ├─ contract.ts                    tool names + zod schemas (shared with server)
   └─ bridge.ts                      renderer side of studio:* IPC
```

```
D:\EXELMJ\electron\studio\
├─ frame.ts            WebContentsView lifecycle · bounds · enableDeviceEmulation
├─ cdpSession.ts       SINGLE owner of webContents.debugger per view
├─ devServer.ts        vite.createServer() in-process
├─ capture.ts          capturePage(rect) → resource handle
├─ editor.ts           launch-editor
├─ mcpHost.ts          utilityProcess.fork + MessagePortMain + port/token lockfile
├─ mcpServer.ts        utilityProcess entry → bundled to dist-electron/mcpServer.cjs
└─ ipc.studio.ts       ipcMain.handle('studio:*')  — matches existing house style
```

**Build change:** add `electron/studio/mcpServer.ts` as a third `entryPoints` item in `scripts/build-electron.mjs` (same options; `external: ['electron']`). Without this, `npm run dist` ships an MCP server that cannot resolve its own SDK (§1.5).

---

## 10. MCP tool surface

**15 tools, grouped by domain.** All mutation flows through one tool. Domain grouping stolen from `zcube/penpot-mcp-server`'s taxonomy; the small-surface-plus-batch shape from Penpot's official server, minus the `eval`.

### Document

| Tool | Input | Returns |
|---|---|---|
| `studio_describe` | `{ docId?, nodeId?, depth?: number }` | compact tree summary, node counts by kind, resource handle for the full doc. **Never the whole document inline.** |
| `studio_get_node` | `{ docId, nodeId, include?: ('style'\|'computed'\|'children'\|'pathData')[] }` | one node + requested facets |
| `studio_find` | `{ docId, query: { kind?, name?, textContains?, styleHas?, tag? }, limit? }` | `NodeId[]` + one-line summaries |
| `studio_apply` | `{ docId, ops: StudioOp[], label?: string }` | `{ applied, docVersion, inverseRef }` — **atomic batch; the workhorse** |
| `studio_undo` | `{ docId, steps?: number }` | `{ docVersion, label }` |
| `studio_redo` | `{ docId, steps?: number }` | `{ docVersion, label }` |

### Emit

| Tool | Input | Returns |
|---|---|---|
| `studio_emit` | `{ docId, target: 'html'\|'vanilla-ts'\|'tokens-css', nodeId?, write?: { dir: string } }` | resource handles per file (+ absolute paths when `write` given) |

### Vector

| Tool | Input | Returns |
|---|---|---|
| `studio_trace_image` | `{ assetId \| path, options: { paletteSize?, smoothing?, mode?: 'color'\|'centerline', preview?: boolean } }` | `{ jobId, pathCount, bbox, resourceRef }` — runs in the worker; `preview: true` returns the fast low-res pass |
| `studio_path_edit` | `{ docId, nodeId, edits: PathEdit[] }` where `PathEdit = { op: 'insertNode'\|'deleteNode'\|'moveNode'\|'setHandle'\|'setCommand', index, point?, handle? }` | `{ d, nodeCount }` |

### Preview / browser

| Tool | Input | Returns |
|---|---|---|
| `studio_preview_start` | `{ projectDir: string, mode: 'dev'\|'static' }` | `{ previewId, url }` |
| `studio_preview_stop` | `{ previewId }` | `{ stopped: true }` |
| `studio_set_viewport` | `{ previewId, device?: string, width?, height?, deviceScaleFactor?, touch?: boolean, colorScheme?: 'light'\|'dark' }` | `{ applied, viewport, degraded?: string[] }` — `degraded` lists anything that needed CDP and could not attach |
| `studio_screenshot` | `{ previewId \| docId, nodeId?, rect?, scale? }` | `{ resourceRef, width, height }` — **handle, never inline base64** |

### Picker

| Tool | Input | Returns |
|---|---|---|
| `studio_pick_element` | `{ previewId, mode: 'interactive'\|'selector', selector?, timeoutMs? }` | `PickPayload`. `interactive` asks the user to Alt+Click — the user-in-the-loop case, expressed as an MRTR `InputRequiredResult` under spec 2026-07-28. |
| `studio_last_pick` | `{ previewId }` | the most recent `PickPayload` |
| `studio_open_in_editor` | `{ file, line?, column? }` | `{ opened, editor }` |

### Resources

`studio://doc/{id}` · `studio://asset/{id}` · `studio://emit/{id}` · `studio://shot/{id}`

**Return discipline (non-negotiable):** any payload that could exceed ~4 KB — a full document, a traced SVG, a DOM snapshot, a screenshot — returns a **resource handle plus a compact summary**. Stolen from `pulsemcp/svg-tracer`. One careless full-SVG return destroys the context window.

---

## 11. Milestone plan

Ordered by dependency, not by the letters (a)–(e). **M1 and M2 deliver visible user value before any new architecture is exposed** — that is deliberate.

---

### M0 — Foundation gates

**Objective.** Resolve the four unknowns that could invalidate the architecture, before any feature code exists.

**Scope.**
- **Gate 1 — renderer origin.** Determine the renderer's origin in a *packaged* build (`base: './'` suggests `file://`). If it is `file://`, a same-origin builder iframe is not reliably achievable in Chromium. Remedy: register a `studio://` privileged scheme (`protocol.registerSchemesAsPrivileged` with `standard: true, secure: true, supportFetchAPI: true`, **before `app.ready`, callable exactly once**) and serve both the shell and the builder canvas from it.
- **Gate 2 — CDP session.** Confirm `webContents.debugger.attach()` on a `WebContentsView`, confirm it detaches when DevTools opens, confirm `enableDeviceEmulation` keeps working without the debugger.
- **Gate 3 — MCP transport.** `utilityProcess.fork` after ready, Streamable HTTP on an ephemeral loopback port, one hello-world tool, reached from `@modelcontextprotocol/inspector`.
- **Gate 4 — packaging.** `mcpServer.ts` added to `build-electron.mjs`; `npm run dist`; verify the installed app starts the server with `node_modules` absent.
- Record the tracer clean-room finding (§1.3) and the Alignment-Guides licence correction (§1.1) in `PROJECT_MAP.md`.

**Success criteria.** All four gates answered yes/no in writing. If Gate 1 fails and `studio://` also fails, the builder canvas falls back to a `WebContentsView` and loses CSS-clippability — a design change that must happen now, not in M5.

**Verification.** Written gate report in `PROJECT_MAP.md` `[ORPHANS & PENDING]`; a packaged installer from `npm run dist` launched on a clean Windows profile with the MCP hello-world reachable from the Inspector.

---

### M1 — Doc kernel + designer gaps 1–3

**Objective.** Ship the three visible designer gaps (resize/rotate, smart guides, image crop) on top of the new op protocol, proving K1 against the existing store before anything else depends on it.

**Scope.** `doc/types.ts`, `doc/ops.ts`, `doc/history.ts`, `doc/adapters/designProject.ts`. Sidecar **v3 → v4** (`Shape.rotation`, `PlacedImage.crop`) with forward-compatible reads. `vector/transformer.ts`, `vector/guides.ts`, `vector/crop.ts`. Bridge `applyOps` into `designApp`'s existing history choke point. **No new npm packages.**

**Success criteria.**
- A v3 sidecar written by v0.3.0 opens in the new build with zero visual difference and zero console warnings
- A shape can be rotated to an arbitrary angle, snapped at 15° with tolerance, saved, reopened, and exported to PDF and SVG at the correct angle
- Guides appear within 1 px tolerance against sibling edges and centres
- An image can be cropped, moved, re-cropped and exported correctly
- One drag = one undo step; undo restores the prior selection
- The layers panel is unchanged for the user

**Verification.** Vitest unit tests for `applyOps`/`invert` round-trip (`applyOps(applyOps(d, ops).inverse)` ≡ `d`) and for v3→v4 migration on fixture sidecars; a rotation golden test comparing exported SVG path data; manual acceptance in the app in both `dir=rtl` and `dir=ltr`; full existing suite green.

---

### M2 — Worker tracer + live preview + path node editing

**Objective.** Close designer gaps 4 and 5. Deliver the highest-value single change in the whole plan.

**Scope.** `vector/traceWorker.ts` + `traceClient.ts` (jobId cancellation, two-pass preview). Expose `fill`/`stroke`/`gradient` in the inspector for `kind: 'path'`. `vector/pathEdit.ts`. **First new packages:** `svg-path-editor-lib@1.0.4`, `bezier-js@6.1.4`, `svgpath@2.6.0`.

**Success criteria.**
- The UI stays interactive throughout a trace of a 4000 × 3000 image; measured main-thread block **< 16 ms** at every sample
- First preview paint **< 150 ms** after a parameter change; changing a parameter mid-trace cancels the in-flight job with no stale result reaching the canvas
- A traced path's fill can be changed and a gradient re-fitted from the inspector
- A node can be inserted at a clicked point on a traced path, dragged, and deleted; export matches the edited geometry
- All three new packages report zero transitive dependencies in the lockfile

**Verification.** Vitest on the worker protocol (cancellation, ordering, superseded-job discard) — `trace.ts` is already pure and node-testable by design. A `performance.measure` harness asserting the 16 ms and 150 ms budgets. A **string-renderer golden test**: serialise the canvas draw-call sequence to text and diff against a committed baseline — technique borrowed from Adobe SVG Native Viewer's `StringSVGRenderer`, zero dependencies, no pixel comparison, immune to machine-to-machine antialiasing differences. This becomes the permanent safety net for all future work on the 3,102-line `designApp.ts`.

---

### M3 — Frame kernel + mini-browser + device switcher

**Objective.** Deliver (d): run a generated project inside EXELMJ with a working desktop/tablet/mobile switch.

**Scope.** `electron/studio/frame.ts`, `cdpSession.ts`, `devServer.ts`. `frame/frameHandle.ts`, `frame/devices.ts`, vendored device JSON, vendored Lucide icons. `browser/browserView.ts` + `deviceBar.ts` + bounds synchronisation. Vite `createServer()` in-process. **Zero new npm packages.**

**Success criteria.**
- A Vite project on disk loads in the embedded view; HMR works
- The three icons switch viewport/DSF/mobile flag; a media-query-driven layout in the loaded page actually reflows
- Touch emulation and UA override work when the debugger attaches; when it does not, viewport switching still works and `degraded` reports which features were skipped
- Bounds stay correct across window resize, maximise, panel collapse and DPI change
- Opening DevTools on the preview does not crash the app — it detaches the CDP session cleanly and the UI reports reduced capability

**Verification.** A fixture Vite project committed under `tests/fixtures/preview-app/` with `@media` breakpoints at 480/834/1280; manual acceptance across the three devices; a bounds-sync stress script toggling panels 100× and asserting the view's rect matches its host element's rect each time.

---

### M4 — Probe kernel + AI element picker

**Objective.** Deliver (c): Alt+Click any element in the mini-browser and get a complete, AI-ready capture.

**Scope.** All of `probe/` including vendored `finder.ts`. `capture.ts` (`capturePage(rect)`). `editor.ts` (`launch-editor@2.14.1`). `doc/adapters/pick.ts`. Injection into both frame kinds.

**Success criteria.**
- Alt+Click on any element in the mini-browser returns a `PickPayload` in **< 200 ms**, screenshot excluded
- The style capture returns **only author-set properties** — verified: a bare `<div>` with one author rule returns exactly one property, not ~340
- At least three ranked selector candidates are returned; every one is verified unique via `querySelectorAll(...).length === 1` **before** being returned
- Arabic text in the element screenshot is correctly shaped and joined (this is free — it is the real compositor)
- The overlay cannot be restyled by the inspected page (closed shadow root)
- For a project our own emitter generated, `source` resolves to a real `file:line:col` and `studio_open_in_editor` opens the editor at that position
- Picking works identically in the builder iframe and the mini-browser — **one code path, proven**

**Verification.** Vitest + jsdom (already a devDependency) for `styleDiff`, `matchedRules` and specificity ordering against fixture stylesheets; a live acceptance script picking 20 elements across the fixture app including a shadow-DOM host and an RTL Arabic block; a byte-size assertion that the injected probe bundle stays **under 25 KB gzipped**.

---

### M5 — Builder view + emitters

**Objective.** Deliver (a): compose a UI visually and emit code we own.

**Scope.** `builder/*` in full — view, palette, inspector (~40 properties), three emitters, `stamp.ts`. The logical-properties lint rule. The live generated-code panel.

**Success criteria.**
- A three-section page can be composed by drag and drop and emitted as HTML+CSS that renders **byte-identically to the canvas** when opened standalone
- The emitted HTML contains **zero** `data-studio-*` attributes and zero editor CSS
- The emitted code contains **zero physical direction properties** — CI lint fails the build otherwise
- Switching the document `dir` between `rtl` and `ltr` requires **no** style edits and produces a correctly mirrored layout
- The `vanilla-ts` emitter output type-checks under the project's existing `tsc` config with no errors
- Emitted files are re-openable: emit → re-import → the tree is structurally identical

**Verification.** An emit → open-in-mini-browser → screenshot → compare-against-canvas-screenshot round trip; `tsc --noEmit` over emitted `vanilla-ts` output in CI; a grep-based lint rule over `dist/` and emitted output for `margin-left|margin-right|padding-left|padding-right|\bleft:|\bright:|text-align:\s*(left|right)`.

---

### M6 — MCP server

**Objective.** Deliver (e): Claude drives Studio end to end.

**Scope.** `electron/studio/mcpHost.ts` + `mcpServer.ts`. `mcp/contract.ts` + `bridge.ts`. All 15 tools. Settings toggle, loopback binding, ephemeral port + bearer token lockfile. `@modelcontextprotocol/server@2.0.0` + `core@2.0.0` + `zod@^4.2.0`; `@modelcontextprotocol/inspector@2.2.0` as a devDependency.

**Success criteria.**
- `server/discover` returns all 15 tools with valid schemas under spec 2026-07-28
- Every result carries the required `resultType`; the server is fully stateless — it works with no `initialize` and no session id
- A scripted scenario succeeds end to end: `preview_start` → `set_viewport(iPhone 15)` → `pick_element(interactive)` → `apply(setStyle)` → `screenshot` → `emit(html)`
- `studio_apply` with 50 ops is atomic — one undo step reverses all 50
- No tool returns more than 4 KB inline; oversized payloads come back as resource handles
- The server is **off by default**; enabling it requires an explicit toggle; requests without the correct bearer token are rejected
- The packaged installer runs the server correctly with no `node_modules` present

**Verification.** `@modelcontextprotocol/inspector` connected to the running app, exercising every tool; a scripted end-to-end scenario run against a packaged build; a negative test asserting that a request without the token is rejected and that binding is 127.0.0.1 only (`netstat` check).

---

### M7 — Hardening and the round-trip decision

**Objective.** Decide, with evidence, whether to build code round-trip (re-parsing hand-edited generated files) — the riskiest requirement in the brief.

**Scope.** Timeboxed spike only. If the evidence supports it: `magic-string@1.2.0` + `oxc-parser@0.144.0`, with the recast-inspired invariant **print → reparse → structural-equality assert → byte-diff guard**, and a hard refusal to write when the guard fails. Also: unify the two undo systems; performance pass; `PROJECT_MAP.md` update.

**Success criteria.** A written go/no-go with a measured failure rate on a corpus of at least 30 hand-edited files. **Default answer is NO** unless the guard achieves a zero false-write rate.

**Verification.** The guard harness itself is the test: for each corpus file, parse → no-op print → assert byte-identical. Any file that fails is a file we would have corrupted.

---

## 12. Risks and unproven items

**R1 — Code round-trip is the single riskiest requirement. Deferred to M7 by design.**
Writing edits back into files a human has since hand-edited is where visual builders lose user trust permanently. The evidence is concrete: `recast` — the reference implementation of formatting preservation — has an **open bug (#1386, filed 2024-02-16, no maintainer response)** where JSX containing comments re-prints `<List>` as `(<List>` **with an unmodified AST**. That is a violation of the identity guarantee in exactly our target syntax. Mitigation: v1 only regenerates files our own emitter produced, and never touches a file whose hash differs from what we last wrote. The correct long-term technique is *"formatting preservation is a range problem, not a printer problem"* — `magic-string` over accurate byte ranges — but it is a milestone, not a v1 feature.

**R2 — `WebContentsView` cannot be clipped, rounded or z-ordered by CSS.**
It is an OS-level layer above the renderer. Bounds must be hand-synchronised on every layout change. This is the main bug source in part (d) and the reason v1 ships without device bezels on that surface.

**R3 — CDP session exclusivity is confirmed and unavoidable.**
Opening DevTools on the previewed `webContents` detaches our debugger. Architecture already degrades gracefully; **do not let any feature become load-bearing on CDP.**

**R4 — MCP spec 2026-07-28 is roughly two weeks old and SDK v2.0.0 is brand new.**
The typescript-sdk README notes PRs from new contributors are limited *"while v2 stabilizes after the 2026-07-28 spec release."* Expect churn. Mitigation: keep `mcp/contract.ts` as the only file that knows SDK types; the bridge speaks plain JSON. Also: **MCP Apps (`ext-apps`) is blocked** — it peer-depends on the v1 SDK line.

**R5 — Sidecar v3 → v4 migration touches every existing user file.**
`rotation` and `crop` are additive and default-safe, but the migration must be tested against real v3 sidecars, and v4 files must remain loadable by the reader (unknown fields ignored) so a downgrade is not catastrophic.

**R6 — Renderer origin under `file://` (M0 Gate 1).**
`base: './'` means the packaged renderer likely runs from `file://`, where Chromium treats documents as opaque origins. A same-origin builder iframe may therefore fail *only in packaged builds* — the worst possible failure timing. This is why it is Gate 1.

**R7 — Worker + vendored-asset packaging.**
The trace worker chunk and the vendored device JSON must survive `vite build` → `electron-builder`. **Import the JSON as a module** (so Vite fingerprints and inlines it) rather than fetching it by path at runtime; `base: './'` plus `file://` makes runtime path fetches fragile.

**R8 — Arabic in the builder canvas rests entirely on one attribute.**
`dir` on `<html>` is the single source of truth. Every mechanism keys off it — `:dir()` selectors, logical properties, our components, emitted code, the iframe's `frameContent`. Getting it wrong breaks all of them simultaneously and invisibly. **Verified gotcha: CSS `direction: rtl` alone does NOT trigger `:dir()`.**

**R9 — Two undo systems coexist between M1 and M7.**
The op layer bridges into the existing snapshot choke point. Acceptable, but it is technical debt and belongs in `[ORPHANS & PENDING]` until M7 unifies them.

**R10 — `launch-editor` spawns a local process.**
Only ever called with paths inside the currently opened project directory; validate and reject anything outside it.

**R11 — Unproven / low confidence.**
The Illustrator COM round-trip remains unverified from prior sessions and is untouched by this plan. `Overlay` remains an experimental CDP domain. The 25 KB probe budget and the 150 ms preview budget are targets, not measurements — M2 and M4 must confirm them.

---

## 13. What we will NOT build

| Not building | Why |
|---|---|
| **GrapesJS adoption** | Two document models, two undo stacks, and its output is still not "code we own". We take three techniques instead. |
| **TeleportHQ UIDL / Mitosis** | Both require authoring in *their* IR (UIDL JSON / a strict JSX subset) on top of our model. A second IR for zero benefit when we control both ends and need two output targets. |
| **React or Vue emitters** | We do not build React apps. React 19 is in the tree only for `@univerjs/presets`. |
| **A new colour tracer (VTracer, ImageTracerJS)** | **Ours is better** (§1.2). Adding either is a downgrade. |
| **Boolean path operations (`pathkit-wasm`, Paper.js)** | Not one of the five named gaps. Feature creep. When it is genuinely needed, take `pathkit-wasm` (BSD-3, 324 KB, Skia PathOps — **do not write your own**, it has eaten years in every vector editor ever shipped). |
| **`harfbuzzjs` + `bidi-js` + `opentype.js` text-to-outline** | The correct long-term answer for Arabic, and a separate project. `bidiRuns.ts` works today. Adding a shaping stack is a rewrite of the text pipeline, not an addition. Note for the day caret/selection in Arabic text boxes is reported broken: the fix is a shaper that returns a **logical↔visual index mapping** (`bidi-shaper`'s `analyze()`), because hand-rolled implementations shape and then discard that mapping, which is exactly why selection jumps. |
| **A CDP-first picker** | Dies when DevTools opens (verified). |
| **`chrome-devtools-mcp` / `@playwright/mcp` / any Chrome-extension-shaped tool** | We already embed Chromium. Bundling Puppeteer + Lighthouse, or an alpha-pinned Playwright plus a multi-hundred-MB browser download, to automate a second browser is indefensible in an offline app. Electron does not support DevTools-panel extensions at all. |
| **WebContainers / Sandpack / Nodebox / `esbuild-wasm` browser bundling** | We have a real Node runtime and a real Vite. WebContainers additionally requires a **paid commercial licence for for-profit production use** despite npm reporting MIT. Nodebox is Sustainable-Use-licensed. Nodepad is MIT-with-Commons-Clause. All three fail the permissive-only constraint. |
| **`loro-crdt` / `yjs` / `automerge`** | No collaboration requirement. Loro is a 3.18 MB wasm blob. We copy its three UndoManager knobs and pay nothing. |
| **`iframe-resizer`** | GPL-3.0 since the relicense. We control both frames; a `ResizeObserver` plus our own IPC is ~10 lines. It will be re-suggested because it is ubiquitous — keep the flag prominent. |
| **`tldraw` / GrapesJS Studio SDK / Preline UI / Remix Icon** | All carry runtime licence-key enforcement, mandatory watermarks, competing-product clauses, or a 2026-01-25 relicense away from Apache-2.0 — while npm still advertises the old licence. All fail the permissive-only constraint. |
| **`mrflix/Alignment-Guides` code** | **No licence file at all** (§1.1). Not "permissive with a caveat" — legally unusable. |
| **Simultaneous multi-viewport grid, third-party web browsing, XFO/CSP stripping** | Out of scope, and the last one disables clickjacking protection. |
| **Publishing the MCP server to the public registry** | Contradicts the offline, local-first framing. |
| **`@modelcontextprotocol/sdk@1.x`** | ~17 transitive dependencies including **both** Express 5 and Hono 4, and it speaks a protocol revision the spec just rewrote. |

---

## 14. Summary for planning

- **New runtime packages: 7.** Six have zero transitive dependencies. The largest addition to the renderer bundle is three pure-logic path libraries totalling well under 100 KB.
- **New dev packages: 1** (`@modelcontextprotocol/inspector`, `npx`-only).
- **Vendored files: 3** (one 9.4 KB TS file, one 80 KB JSON, five SVGs).
- **Nothing existing is rewritten.** `DesignProject` keeps its file format. `designApp.ts` keeps its history choke point. The tracer keeps its algorithm.
- **The single riskiest requirement (code round-trip) is explicitly deferred** with a written go/no-go gate and a measurable pass condition.
- **The first two milestones ship visible user value** — rotate handles, crop, and a tracer that no longer freezes the app — **before any new architecture is exposed to the user.**