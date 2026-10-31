# PROJECT_MAP.md — EXELMJ

برنامج جداول لسطح المكتب يشبه اكسل (ويندوز، بدون إنترنت)، واجهة عربي/إنجليزي.
Excel-like offline Windows desktop spreadsheet. Univer engine + Electron shell.

## [TECH_STACK]

| Component | Package | Version (exact-pinned) | License |
|---|---|---|---|
| Spreadsheet engine | `@univerjs/presets` (8 OSS presets) | 0.25.1 | Apache-2.0 |
| Desktop shell | `electron` | 43.1.1 | MIT |
| xlsx read/write | `exceljs` | 4.4.0 | MIT |
| Charts | `echarts` | 6.1.0 | Apache-2.0 |
| Renderer bundler | `vite` | 8.1.5 | MIT |
| Installer | `electron-builder` (NSIS) | 26.15.3 | MIT |
| Float-DOM chart host | `react` / `react-dom` | ^19 | MIT |
| Electron bundler | `esbuild` | ^0.28.0 (vite 8 peer range) | MIT |

**Enabled Univer presets (all free/OSS):** core, sort, filter, find-replace,
conditional-formatting, data-validation, hyper-link, drawing.

**⛔ FORBIDDEN DEPENDENCIES:** `@univerjs/preset-sheets-advanced` and every
`@univerjs-pro/*` package. They are license-gated: without a paid license they
add a page watermark and cap import (1 MB) / export (10k cells). They are
present in `node_modules` as transitive deps of `@univerjs/presets` — never
import them. xlsx exchange is built in-house on exceljs; charts on echarts.

**Univer 0.x churn warning:** minor version bumps break APIs. Versions are
exact-pinned; upgrades must be deliberate, tested decisions.

## [SYSTEM_FLOW]

- **Boot:** `electron/main.ts` loads settings (userData/settings.json: language,
  recentFiles) → builds native localized menu → creates BrowserWindow →
  renderer `src/main.ts` reads settings via preload bridge → `initI18n` (sets
  html dir rtl for ar) → `setupUniver` registers 8 presets with en-US + ar-SA
  locales → `DocController.newWorkbook()`.
- **Menu → renderer:** main sends `('menu', action, payload?)` over IPC;
  renderer switch in `src/main.ts` (new/undo/redo wired; open/save in M2).
- **Open (M2):** menu → main `dialog.showOpenDialog` + `fs.readFile` → bytes →
  renderer `importXlsx(bytes)` → `IWorkbookData` → dispose old unit →
  `univerAPI.createWorkbook(data)`.
- **Save (M2):** renderer snapshot → `exportXlsx` → bytes → main writes file
  (`.bak` of previous version first) → dirty=false → title updates.
- **Close guard:** main intercepts `close` when dirty → native Save/Don't
  Save/Cancel (localized) → 'save-then-close' → renderer (M2).
- **Language switch:** menu radio → main persists settings.json → rebuilds menu
  → `webContents.reload()` → renderer boots with the other locale.
- **Web edition (phones; `npm run build:web` → dist/web):** `src/web/entry.ts`
  installs `window.exelmj` from `src/web/webBridge.ts` (browser APIs instead of
  Electron IPC), then boots the SAME `src/main.ts`; Design/Photo/Studio are
  cut by `import.meta.env.VITE_WEB`. Open = File System Access picker, else
  `<input type=file>`; every open/save also keeps a copy in IndexedDB (Open
  Recent); autosave every 20 s and whenever the app is hidden. dist/web/sw.js
  (written at build from `src/web/sw.js`) precaches every file → offline.
  Share into the app: manifest `share_target` → the service worker keeps the
  file in cache `exelmj-shared` → `./?shared=1` → `getPendingOpenFile()` feeds
  the normal boot routing (held in Open Recent + a toast when unsaved work of
  the same kind is waiting).

## [ARCHITECTURE]

```
electron/main.ts        window, settings, close-guard, single-instance, clipboard permissions
electron/menu.ts        native menu from src/i18n JSONs; Edit items show shortcuts but
                        registerAccelerator:false so Univer keeps Ctrl+Z/C/V handling
electron/ipc.ts         IPC surface: settings, dirty flag, generic file IO (open/read/save/save-as + .bak)
electron/preload.ts     contextBridge "window.exelmj" (typed in src/types.d.ts)
scripts/build-electron.mjs  esbuild → dist-electron/{main,preload}.cjs (CJS; package.json is type:module)
scripts/dev.mjs         esbuild once + vite dev server + spawn electron (ELECTRON_RENDERER_URL)
src/main.ts             renderer boot + menu action dispatch
src/univer/setup.ts     THE ONLY Univer config point: createUniver + 8 presets + locales + css
src/univer/findAllSheets.ts  Ctrl+F searches EVERY sheet (workbook scope by default) + a strip in the find dialog: "found in N sheets", one chip per sheet, click = jump
src/univer/touchSheet.ts touch on the grid: swipe scroll, pinch zoom, tap / double-tap / long-press → synthetic mouse events
src/web/                WEB EDITION (phone PWA): entry.ts, webBridge.ts (window.exelmj on browser APIs), webFiles.ts
                        (pickers/download/share + pure helpers), webStore.ts (settings + IndexedDB autosave/recent),
                        webShell.ts (menu drawer, app bar, toast), phoneLayout.ts (≤767 px CSS), sw.js (template), public/
vite.web.config.ts      web build: root src/web, base ./, VITE_WEB=1; writes dist/web/sw.js (asset list + content hash)
scripts/make-web-icons.mjs  draws the PWA icons (192/512/maskable) — regenerate, never hand-edit the PNGs
src/doc/docController.ts document lifecycle: new (open/save/dirty in M2), window title
src/i18n/{en,ar}.json   app-chrome strings (menus, dialogs) — shared by renderer AND electron/menu.ts
src/i18n/i18n.ts        t(), lang, html dir switching
src/xlsx/  (M2)         importXlsx / exportXlsx / styleMap / chartMeta — exceljs ↔ IWorkbookData
src/charts/ (M4)        chartManager / ChartFloat.tsx / chartDialog — echarts in Univer float-DOM
tests/ (M2)             vitest round-trip suite for the converter
```

**Converter fidelity contract (M2/M3, the promise to the user):**
Round-trips with real Excel: values, formulas (text; each side recalculates),
font name/size/bold/italic/underline/strike/color, fill color, borders
(style+color), h/v alignment + wrap, number/currency/date formats, merged
ranges, column widths/row heights, hidden rows/cols, freeze panes, multi-sheet
+ names + tab colors. Tools (M3, src/xlsx/resourceMap.ts): autoFilter RANGE
(no per-column criteria); data validation = literal lists + whole/decimal/
date/textLength with operators (range-sourced lists & custom dropped);
conditional formatting = highlightCell number single-operand ops +
containsText (between/colorScale/dataBar dropped). NOT round-tripped in v1:
images, comments, rich-text runs inside a cell, hyperlink cells (imported as
text), defined names, native charts (EXELMJ charts persist in a veryHidden
`_EXELMJ_META` sheet, render only in EXELMJ; export sets
`calcProperties.fullCalcOnLoad`).

### Illustrator parameter model → ours (extracted 2026-08-14 from the
### installed app's Vectorize.aip plugin strings, at the manager's request —
### inferred and re-implemented, nothing copied)
- Their engine's own debug strings confirm the SAME architecture we built
  independently: median region filter (debugoutput/medianRegColors) → palette
  (paletteColors) → regions → curve fitting ("Curve Fit Version 2.0").
- Mapping (their key → our knob):
  ip/PathFidelity → traceOpts.detail (RDP tolerance)
  ip/CornerFidelity → traceOpts.cornerDeg (findCorners threshold, 25..85°)
  ip/NoiseFidelity → traceOpts.noise (min speck px)
  ip/Limitedcolors / AutomaticcolorsFidelity → colors: number | 'auto'
  ip/grayscale + ip/threshold + mode → traceOpts.mode color/grayscale/bw + threshold
  ip/OverlappingOrAbutting → we ALWAYS overlap (stacked layers — their
    tooltip "Creates stacked paths"); abutting is strictly worse, not offered
  output/ignorewhite → ignoreBackground 'auto'
  output/ignoreColors + shouldIgnoreColors → dropColors (eyedropper)
  output/snapcurvestolines → snapLines (run-level: a run whose points all hug
    the corner-to-corner chord becomes ONE L; per-cubic snapping would flatten
    circle arcs, tested)
  output/shouldSimplify + simplifyCurvePrecision → detail again (one knob)
  statistics/pathcount+anchorcount → the post-trace status line
  Their full 12-preset table → TRACE_PRESETS (default/hifi/lofi/3/6/16/gray/
    bwlogo/technical/sketch/silhouette/lineart) — values are OUR mapping of
    each preset's intent, not copied numbers.
- NOT implemented (their keys with no counterpart yet): enableGradient +
  GradientFidelity (gradient detection), tracing/strokes + maxstrokeweight
  (centerline stroke detection), fitliveshapes, createLiveText (OCR).

### 0.2.2 final verification (2026-08-14, night session end)
- THE STREAK BUG (manager's isometric trace showing long blue bands): the two
  marching-squares SADDLE cases linked their crossings in the REVERSED
  direction whenever the cell centre said "join". A reversed link writes a
  second outgoing edge onto a crossing another cell already claimed, welding
  two unrelated loops — hence contours jumping across the page. Fixed in
  isoContour.ts (joined saddle ≈ the COMPLEMENT corner case: 5→R-T/L-B,
  10→T-L/B-R), centre comparison made STRICT so an exact-0.5 centre (binary
  corner touch) separates. Pinned by 3 tests incl. max-step contiguity.
- Verified live on E:\control table design-01.jpg (8334px): 11 paths, 16371
  anchors, zero streaks, glass reflections correct. Status line now reports
  paths/anchors (their statistics counters).
- snapcurvestolines implemented at RUN level (whole corner-to-corner edge →
  one L when every point hugs the chord); per-cubic snapping was tried first
  and REJECTED — it flattened short circle arcs (test caught it).
- cornerDeg (their CornerFidelity) exposed as the «الزوايا» slider 25..85°;
  presets extended to their full table (+technical/sketch/silhouette/lineart).
- PACKAGED-BUILD OPEN BUG (this cost an hour — keep the lesson): a caller
  that passes an UNQUOTED path with spaces delivers it as several argv
  entries; fileFromArgv now re-joins consecutive non-flag args and retries.
  Found via a temp main-process argv log (removed). Boot also hardened:
  newWorkbook wrapped (safeNewWorkbook) and autosave recovery raced against a
  4s timeout — a Univer [redi] injector failure used to leave its promise
  unsettled and eat the double-clicked file.
- TEST-HARNESS lesson recorded: PowerShell Start-Process -ArgumentList does
  NOT quote; bash does. Always quote, and always kill stale instances first —
  the single-instance lock forwards launches to the OLD binary otherwise.

### The three pending Illustrator-model items — DELIVERED (2026-08-14)

1. GRADIENT DETECTION (their enableGradient / GradientFidelity)
   - src/design/gradientFit.ts — closed-form least squares, no iteration and no
     random seeding, so the same picture always yields the same gradient. Fits
     each channel as a plane, takes the DOMINANT eigen-direction of the three
     gradient vectors (one shared direction = one two-point gradient rather
     than three unrelated ramps), refits along it, and accepts only if the
     residual is small AND the end-to-end colour distance is real. Ends are
     trimmed at the 2nd/98th percentile so a stray pixel cannot stretch a ramp.
   - Why: quantisation slices a ramp into flat bands and the steps read as
     banding. A per-region gradient makes neighbouring bands meet at the same
     colour, so banding dissolves with no extra paths.
   - Carried end to end: TracedPath.gradient -> Shape.gradient (local pt,
     scaled with the path) -> SVG defs/linearGradient, canvas
     createLinearGradient, and a REAL PDF axial shading. PDF has no gradient
     fill, so the path becomes a CLIP and a ShadingType-2 dict is painted
     through it (q / cm / path / W n / sh / Q); the cm puts us in the shape's
     own y-down space so path and gradient coordinates go in unconverted.
     Falls back to a flat fill if the shading fails — an export never dies.
     Verified by INFLATING the content stream in the test, not by regex over
     compressed bytes (the first attempt at that test was a false negative).

2. CENTRELINE / STROKE DETECTION (their tracing/strokes + maxstrokeweight)
   - src/design/centerline.ts — Zhang-Suen thinning, a skeleton walk into open
     polylines, then width = area / skeleton length.
   - THREE real bugs found by testing, each worth keeping:
     a) BRANCH DEGREE. An 8-connected line that steps diagonally gives its
        pixels three neighbours while still being one pixel wide, so a raw
        neighbour count reads a plain curve as a junction. Measured live: 32 of
        84 ring pixels looked like junctions and the ring shattered into 89
        two-point stubs. Fixed by counting connected GROUPS of neighbours (the
        crossing number): 1 = end, 2 = curve, 3+ = junction.
     b) STEP ORDER. Ring order let the walk cut a staircase corner diagonally
        and strand the skipped pixel, which surfaced as a second bogus run.
        Orthogonal-first stepping keeps every pixel on its own path.
     c) THE STROKE-VS-FILL GATE. An average width divides a desk top's long
        branching medial axis down to a small number and sails through — every
        filled surface of the isometric drawing became a fat stray line, caught
        in the LIVE PREVIEW. Replaced with "does a disc of radius maxWidth/2
        fit anywhere inside" (survivesErosion): a pen stroke vanishes after W/2
        erosions however long or bent it is, while any solid area keeps a core.
        Pinned by rectangle + L-slab tests.
   - Output: fill='' + stroke=colour + strokeWidth, so it renders and exports
     as a real stroked path everywhere. Enabled by the technical/line-art
     presets.

3. LIVE PREVIEW
   - ONE code path serves preview and commit (traceTarget -> traceAt(cap) ->
     traceRunOptions); only the raster cap differs (700 vs 2000). A preview
     produced by different code would be a promise the result does not keep.
   - Debounced 260ms, re-entrancy guarded (previewBusy/previewDirty), driven by
     a single input/change listener on the whole panel so every knob refreshes
     it. Overlay is an absolutely-positioned SVG in page space, cleared on
     commit, on closing the panel and on opening another document; a zoom
     re-lays it out.
   - It paid for itself immediately: bug 2c was invisible to the unit tests and
     obvious the moment the preview drew it.

## [ORPHANS & PENDING]

- 🟡 IN PROGRESS: WEB EDITION (mobile PWA) of Sheets + Documents (owner
  decision ed7118a4 "تطبيق ويب"; plan + progress: docs/web-edition-plan.md).
  DONE 2026-09-25, each verified in an isolated headless Chrome at phone size:
  M0 touch gestures (proof cfbc97e5), M1 web build/bridge/offline (7791a9bc),
  M2 Documents phone UI (20b8687d), M3 Sheets phone UI (90afc141), M4 share
  into the app (da1e09bd). PENDING M5: hosting — the owner wrote "سوي على كلود
  فاير" (Cloudflare or Firebase? asked, not yet answered; Cloudflare needs an
  account he creates himself; the Firebase CLI is already logged in → a NEW
  project, never Nabihny); then his own phone test. Never deploy without his
  explicit yes. Unverified until a real phone: the Android print dialog / PDF,
  File System Access write-back, Web Share of .xlsx/.docx, the RTL canvas at
  DPR 2.6–3.5 on hardware. Not offered on the web: PDF→document import (the
  picker takes xlsx/xlsm/csv/docx). Test harness traps: the Claude browser
  pane has no service workers and withholds rAF while hidden; port 9333 is an
  Edge instance (never drive it) — use chrome --headless=new on 9477 with a
  temporary profile; a rebuilt sw.js takes over only after every window of the
  app is closed (navigate to about:blank and back).

- ✅ FALSE "UNSAVED" AT LAUNCH (2026-09-25, bug 86c2d169, repro 587996f3 →
  17f28cec). A spreadsheet with formulas opened at launch (double-clicked on
  the desktop, or shared into the web app) showed "*" within ~0.6 s. Cause:
  Univer writes recalculated values back as sheet.mutation.set-range-values
  with options.fromFormula, and the first calculation after launch lands after
  DocController's 300 ms load window. Fix: the dirty listener skips
  options.fromFormula (src/doc/docController.ts); tests/docDirty.test.ts. On
  the phone it also stopped the next shared spreadsheet being held back and a
  spurious "Recover a file" question. The desktop gets it with the next
  installer.

- ⚠️ OPEN — owner to decide (pre-existing, desktop too):
  (a) Opening a file while there are unsaved changes discards them silently,
      in Sheets and Documents: the unified open path in src/main.ts bypasses
      confirmDiscardThen (breaks the lesson "every path that replaces a
      document goes through confirmDiscardThen").
  (b) Launch recovery race (src/main.ts recoverWithTimeout, 4 s): if "Recover
      a file" is not answered within 4 s, boot goes on with newWorkbook() →
      setDirty(false) → clearAutosave(), so the saved copy is deleted while
      the question is still on screen. OK still restores (the bytes are in
      memory), but closing or losing the app before answering (likely on a
      phone) loses the work.

- ✅ FIND ACROSS ALL SHEETS (2026-09-25). Manager: sheet search must cover every
  sheet at once and tell him, small, which sheets hold the result, with a way to
  jump between them. Root cause of "current sheet only": Univer's plain Ctrl+F
  starts every session at findScope SUBUNIT; the workbook scope lives only in the
  advanced (replace) dialog. Fix = src/univer/findAllSheets.ts: each new session
  flips to FindScope.UNIT (replace mode keeps the current-sheet default on
  purpose — no Replace-All across the workbook by surprise) and a strip is
  mounted as a sibling of `[data-u-comp="find-replace-dialog"]` inside the Radix
  dialog root ("found in N sheets" + a chip per sheet with its count; the active
  sheet's chip highlighted; click = setActiveSheet + service.focusSelection()).
  TRAPS: (1) FindReplaceService.state$ REPLAYS a made-up initial state with
  revealed:true — read service.revealed, never state.revealed, or the "dialog
  opened" transition is never seen; (2) change scope in a microtask, not inside
  the state$ emission (out-of-order delivery to Univer's own dialog); (3)
  currentMatch$ does NOT follow sheet activation — highlight by ACTIVE sheet
  (ActiveSheetChanged); (4) rAF is throttled in hidden windows — schedule the
  DOM update with a timer. DEBT: per-sheet matches come from Univer 0.25.1
  INTERNALS (`service._model._findModels[].getMatches()`); the version is pinned
  exact, and if the fields move the strip just stays hidden (search still works)
  — re-check on any Univer upgrade. Tests: tests/findAllSheets.test.ts (6).

- ✅ "NOTHING CHANGED" WAS TWO APPS (2026-08-15, night). The owner reported the
  design page's details gone and the restyle invisible. Neither was a code
  bug: an INSTALLED EXELMJ 0.3.0 (AppData/Local/Programs/EXELMJ, from
  release/Setup 0.3.0.exe weeks ago) was running alongside the dev instance —
  taskkill caught EXELMJ.exe PID live — and the taskbar habit opens THAT.
  Every demo of the session happened in the dev electron; the installed app
  had none of it. Resolution: version bumped to 0.4.0 (package.json AND the
  renderer's APP_VERSION, which had drifted to 0.2.2), `npm run dist`,
  silent-installed with /S, verified by CDP on the INSTALLED binary: skin
  sheet present, motion tab present, screenshot taken. RULE FOR NEXT TIME:
  when the owner says "unchanged", first ask WHICH window — and after a big
  milestone, ship the installer (`npm run dist` + `Setup /S`), because the
  installed app is the one his taskbar opens. NSIS auto-launches the app
  after silent install and it grabs the single-instance lock — kill it before
  relaunching with a debug port.

- ✅ A REAL ANIMATED ICON, PROVEN FRAME BY FRAME + THE APPLE-GRAMMAR SKIN
  (2026-08-15, late). Two asks: actually MAKE an animated icon and prove it
  runs begin→end without a flaw; then restyle the design page in Apple's
  design language.
  • THE ICON: real Home01 geometry from the shipped Hugeicons library, scaled
    and centred by the same maths insertLibraryIcon runs, grouped, given an
    entrance (staggered draw 1100ms + rise/fade 600ms) and a hover spring —
    emitted through the real bundler and run in a real engine. MEASURED at
    three points: t=120ms strokes 97%/100% hidden (door not yet started — the
    stagger), t=570ms 13%/48% (both drawing, door trailing), t=1.8s both 0 and
    HOLDING. Mid-flight screenshot shows the house ~86% drawn with the door
    behind it. Beginning stated, end stated, no flaw.
  • THE SKIN (SKIN_CSS, its own <style> appended AFTER the base sheet so it
    wins every cascade tie without touching hundreds of base rules): one
    accent (#0a84ff), near-black ink, hairline borders, frosted chrome
    (backdrop-filter saturate+blur) on the toolbar/status/palette, the studio
    tabs as an iOS segmented control (white pill on tinted track), tools as
    34px rounded tiles with the active one filled blue, panels/menus/dialogs
    on one 13px-radius surface language, primary actions all the same blue,
    and menu hover the classic accent-row. HOW THINGS ARRIVE: panels, menus,
    dialogs, tabs, crumbs and the inspector rise 8px and fade in through
    @starting-style — the motion compiler's own technique, eaten at home —
    all disabled wholesale under prefers-reduced-motion.
  • Verified live after the restyle: zero elements outside the window, the 5
    disabled toolbar buttons legible at 0.28 opacity, segmented control
    renders, modal screenshot confirms the full dialog language.

- ✅ ICON PLACEMENT, STROKE SCALING, HONEST STARTS, AND A WIDE PRESET LIBRARY
  (2026-08-15, evening). Four requests plus four live bug reports, all closed
  and verified by driving the real app.
  • ICONS LAND CENTRED. insertLibraryIcon gathered runs and placed each at the
    grid origin — every icon appeared in the page corner at thumbnail size.
    Now two passes: gather, compute the UNION box, offset so its centre is the
    artboard's centre (an icon CANVAS keeps grid placement — there the grid
    position IS the point), and select what was inserted. Verified: icon
    centre (200,283) == page centre (200,283).
  • STROKES RIDE THE RESIZE. strokeScaleFactor (transform.ts, pure, tested):
    geometric mean of the two axis factors — a uniform scale exactly, a
    stretch split down the middle, degenerate boxes at 1 so a collapsed axis
    cannot zero a stroke. Applied in applyOverlayResize (per-frame ratios
    multiply out exactly) and resizeGroup (from the snapshot, no drift).
    Toggle in the appearance inspector, ON by default — Illustrator's "Scale
    Strokes & Effects". Verified live: 1.5pt → 15.98pt under a 10.65× enlarge.
  • RECORDING A MOTION NO LONGER MOVES THE OBJECT. The rest rule was written
    even for a NEUTRAL start, so saving any motion teleported the object to
    its rest pose. Now only changes whose `from` differs from the property's
    neutral value are anchored; a colour's unspecified start is the sentinel
    'auto' (the old silent '#ffffff' default REPAINTED shapes white at rest).
    The panel shows one checkbox — "نقطة بداية مخصّصة" — off by default:
    off = from where it is; on = pinned start, and the object sits there.
  • THE STALE-CLOSURE BUG behind "المدة والتأخير ونقطة البداية ويبدأ من/ينتهي
    عند لا تعمل": every control captured the interaction at render time, and
    the panel does not re-render on slider drags (rebuilding a slider
    mid-drag kills the drag). So ▶ previewed values from when the card was
    OPENED, and editing "from" then "to" had the second write resurrect the
    first's old value. Every handler now reads the CURRENT interaction by id
    at event time; previews are debounced 220ms; and the generated-CSS view
    refreshes live on each edit (it too only updated on reopen, which read as
    the edit not working even when the model took it). Verified live:
    duration 1500ms + delay 300ms in the emitted CSS immediately.
  • PREVIEW COMPOSITE FIX: transform previews now composite:'add' onto the
    node's own transform — a path carries its position in translate(x y), and
    a replacing animation teleported icons to the page origin for the length
    of the preview.
  • THE PRESET LIBRARY IS WIDE: 18, in two labelled families. Touched (12):
    draw, pulse, wiggle, shake, spin, bounce, tada, heartbeat, jelly (press),
    lift, glow, float. Arriving (6): fadeIn, popIn (spring), slideIn, riseIn,
    blurIn, drawIn (staggered stroke entrance). Tests pin: every hover preset
    starts NEUTRAL (recording moves nothing — draw exempt, hidden-at-rest is
    its point), every appear preset states where it arrives from, and every
    preset survives the validator byte-identical.

- ✅ THE ICON MOTION SYSTEM (2026-08-15). Asked for "the best system for
  animating icons, built our way". Researched Lordicon (trigger model: in /
  click / hover / loop / loop-on-hover / boomerang) and the standard CSS
  stroke-reveal. Verdict: our trigger model already covered Lordicon's — what
  icons NEED beyond it is exactly two things, and both are now native:
  • DRAW (`prop: 'draw'`, 0..1): the stroke drawing itself in — THE icon
    animation. Compiled as stroke-dashoffset over a NORMALISED length: the
    exported <path>/<line> get pathLength="1" stamped (MarkupInject.pathLength,
    flowing bundle → htmlExport), so no path ever has its real length
    measured. Draw rules land on `:is(path, line)` DESCENDANTS — dashoffset
    means nothing on the box — via the same rest-bucket mechanism (the bucket
    key carries the descendant suffix). The canvas preview measures real
    lengths with getTotalLength, giving the identical picture.
  • STAGGER (`Interaction.stagger`, ms): an icon here is a GROUP of runs, and
    parts a beat apart read as a thing moving where parts together read as a
    picture shaking. Implemented by EXPANSION (expandStagger): one ordinary
    interaction per member, each delay+k*stagger, trigger left on the group —
    hovering any member puts the wrapper in :hover (members are
    pointer-events:auto inside the pointer-events:none wrapper). Expansion
    means the compiler, the transition-merging and the preview all run on code
    they already had.
  • SIX PRESETS (motionPresets.ts): draws-itself (staggered 120ms by default),
    pulse, wiggle (decaying bell-swing ±12→∓10→±6→0, ends at zero), spin,
    bounce (arc via stops), float. One press records an ORDINARY interaction —
    everything editable afterwards. A preset the validator would repair is a
    button that records something other than what it says; a test cleans each
    one and asserts nothing changed.
  • Groups are now motion targets (objects() lists them first-among-equals,
    labelled by icon name; the current selection sorts first so a preset lands
    on what the user is looking at). Group preview falls back to playing every
    member when the group has no canvas node of its own.
  • BUG CAUGHT BY THE FIRST TEST RUN: the draw emitter was placed after
    `if (!active.length) continue`, and a draw-only interaction has an empty
    box-change list — so the whole draw path was dead code until the emitter
    moved above the guard.
  • VERIFIED END TO END in a real engine: emitted page shows both paths with
    pathLength="1", computed rest dashoffset 1 / dasharray 1, the second part
    at transition-delay .15s, and the group-hover rule taking both to 0.
    Canvas preview captured mid-flight actually drawing. 1184 tests.

- ✅ A MOTION HAS A BEGINNING (2026-08-15). The owner: it must start from the
  place I choose, not from wherever the object happens to be. Making the start
  REQUIRED then exposed two bugs that an optional start had been hiding.
  • `Change.from` is no longer optional. "Wherever it already is" reads well
    and behaves badly: the motion cannot be replayed, cannot be reasoned about,
    and plays differently depending on what happened before it. The resting
    rule now IS the start — that is what "a motion has a beginning" means in
    CSS — and the trigger rule is the end. A missing start migrates to the
    property's neutral value, so an older document still parses.
  • APPEAR WAS RUNNING BACKWARDS. @starting-style carried `to` and the resting
    rule carried `from`, so every entry animation played in reverse and settled
    on the value it was supposed to have LEFT. Invisible while the start was
    optional, because there was usually no start to be wrong about.
  • A KEYFRAMED MOTION WAS PLAYING ON PAGE LOAD. The animation was attached to
    the element rather than to the trigger, so it ran once, to nobody, before
    anyone had touched anything — and never again. Found by reading the panel's
    own generated CSS. It now hangs on the trigger selector (:hover, :active,
    :focus-visible, :has(:checked)); appear and scroll keep theirs on the
    element, because neither is a state the element is IN.
  • …and the transition is no longer emitted alongside it. Two mechanisms each
    trying to own the same property is a flicker, not a motion.
  • STOPS IN BETWEEN (`Change.via`) are the "more precise detail" asked for.
    A transition knows two states, so any stop turns the motion into keyframes;
    every change is sampled at EVERY offset any of them asked for, because one
    @keyframes block drives them all and a frame missing a value is a frame the
    browser interpolates through blind. Stops are sorted rather than refused —
    the panel hands them over in edit order — and one sitting on 0 or 1 is
    dropped, since those are `from` and `to`.
  • `hold` decides whether a fired motion keeps its last frame. It only appears
    for the triggers that FIRE: while a pointer is held on an object the state
    is the pointer's, and letting go is what ends it.
  • The canvas preview walks the same offsets through the Web Animations API,
    computed from the same helpers the compiler uses — so what is previewed and
    what is exported cannot drift apart.

- ✅ MOTION RECORDING: FIVE MILESTONES, ALL SHIPPED (2026-08-15).
  "Make a button, press it, it moves — and record that as HTML and CSS without
  writing a line." Built from scratch rather than on a library, so the output
  runs anywhere it is pasted with nothing installed.
  • M1 — htmlExport.ts: THE DESIGN AS A PAGE. The bundle described the design
    (Markdown, tokens, SVG, source) and a description is not a page: there were
    no elements, so there was nothing a CSS rule could attach to. One element
    per object, LOGICAL properties only (an Arabic page mirrors), inline SVG
    for real vector geometry, groups as wrappers. classOf(id) is the contract
    the compiler writes against, so the two agree without importing each other.
  • M2 — design/motion.ts: THE MODEL. Six triggers, nine animatable properties
    — each one cheap on the compositor, which is why width and top are absent.
    Side-table like groups, so a document that records no motion still
    serialises as version 3. It refuses what it cannot mean rather than
    repairing it: a motion that changes nothing is dropped, not kept as a row
    that does nothing when pressed.
  • M3 — motionCss.ts: THE COMPILER, and the piece with no library underneath.
    hover/press/focus/appear/scroll need no script at all; `:has()` is what
    lets one object's hover move ANOTHER with no script; @starting-style is
    what makes an entry animation need no setTimeout. A spring is emitted as
    `linear()` sampled from a damped oscillator, because a bezier has one hump
    and cannot overshoot twice. Repeat and direction fall back to @keyframes,
    since a transition cannot do either.
  • THE TOGGLE'S HONEST COST: CSS can style on :checked but cannot set
    aria-pressed, so a CSS-only toggle looks right and reads wrong to a screen
    reader. Four lines of generated script carry the state and make it
    keyboard-reachable; `emitAria: false` is a deliberate choice, not a
    default.
  • M4 — motionPanel.ts: four decisions, no keyboard. Live preview runs through
    the Web Animations API on the DOM node, NOT by mutating the document — a
    preview that edited the shapes would land in the undo stack, and "let me
    see what this looks like" must not change anything. It shows the CSS it
    produced, because a person who never writes CSS still deserves to see that
    something real came out.
  • M5 — the bundle gained ui/index.html + ui/motion.css (+ motion.js only when
    a toggle needed it). A toggle's checkbox travels WITH its rules, or the CSS
    selects a checkbox that does not exist.
  • BUG FOUND BY RUNNING THE OUTPUT IN A REAL BROWSER: two motions on one
    object each emitted their own `transition` declaration, and CSS keeps only
    the last. A panel that faded on hover and turned on click lost its fade —
    the rule was there, the transition naming `opacity` was not, so the
    property jumped. Rest states are now gathered PER ELEMENT and emitted once.
    Five tests pin it.

- ✅ THE FLEXBOX TRAP, TWICE (2026-08-15). Asked to check the UI for anything
  misshapen: the motion panel's slider rows measured 282px inside a 255px
  panel and hung off the LEFT EDGE OF THE WINDOW, and the appearance inspector
  overflowed by a hundred pixels, which is what had put a horizontal scrollbar
  under the layers list. Both are the same cause: a flex item will not shrink
  below its content's min-content width unless told it may, and an
  <input type="range"> has a wide intrinsic minimum. `min-width: 0` on every
  such item, plus one-line labels with ellipsis — a label that wraps makes its
  row twice as tall as its neighbours, and a column at two heights reads as a
  mistake even when every value in it is right. Swept afterwards: every tab
  opens with content, nothing clipped, no unlabelled control, 29 buttons
  pressed with no error, all ten tools iconed and titled, no duplicate
  tooltips.
  • HARNESS NOTE: opening the built-in browser tab adds a SECOND page target to
    CDP, and scripts/cdp.py was picking the first — a blank one — so every
    evaluate hung with no error and read exactly like the app had frozen. It
    now selects the target by URL.

- ✅ DROVE THE REAL APP AND FIXED WHAT GOT IN THE WAY (2026-08-15).
  The owner asked for the app to be USED rather than reasoned about. Driven
  through CDP (scratchpad/cdp.py — the standing technique, see the note below
  about devicePixelRatio): every toolbar button, all ten tools, group,
  isolation, the right-click menu, undo/redo, zoom, and the layers panel.
  • WHAT ALREADY WORKED, verified by doing it: all four drawing tools; select,
    move and resize; group and its disclosure row; isolation with dimming;
    the 22-entry context menu with correct enable/disable; undo/redo of a
    GROUPING (studio state is in captureState, so it round-trips); zoom; the
    text tool; the appearance inspector; the layers panel's target circles.
  • A NEW DOCUMENT DID NOT FIT THE WINDOW. A 1080pt page opened at 100% in a
    614pt stage, so the first thing you saw of the document you had just made
    was its top half — and there was no fit control at all, by button or by
    key. Added fitToWindow(), wired to a ⤢ button inside the zoom group, to
    Ctrl+0 (Ctrl+1 is actual size), and run automatically after new AND after
    open. Measured: 1080 → 566 fitted, 1080 at actual size.
  • THE ZOOM CONTROLS WERE SPLIT ACROSS TWO ROWS. The toolbar wraps, and the
    minus landed on one line with the plus and the percentage on another, at
    opposite ends of the window. Controls that belong together now sit in a
    .dz-btn-group, which wraps as a unit.
  • ELEVEN BUTTONS WERE LIVE THAT COULD NOT WORK. With an empty canvas and no
    selection, export/save/word/expand/split/nodes/crop all looked pressable
    and did nothing — which teaches the user that the toolbar is decorative.
    The right-click menu had greyed these out from the start; the toolbar now
    does the same through syncToolbar(), run from syncOverlay and after every
    open/new.
  • TWO BUTTONS SHARED THE BOLD "B" GLYPH. Expand and Expand Appearance were
    indistinguishable, and Release borrowed the delete-table icon. Three
    drawn glyphs added.
  • THE EMPTY CANVAS SAID NOTHING. One sentence in the status bar at the very
    bottom of the window, and no hint that "new" existed. It now carries the
    two things you can do, on the canvas, where the eye already is.
  • TESTING NOTE: CDP's Input.dispatchMouseEvent does NOT synthesise a
    `dblclick` from two presses — isolation looked broken until the event was
    dispatched directly, and then worked. And a Ctrl+Z that lands while a text
    box has focus is correctly ignored by the app (the browser undoes the
    typing instead); a probe that had just created a text box mis-read that as
    a broken undo. Both were the harness, not the app.

- ✅ THE NEW-DOCUMENT DIALOG (2026-08-14). "New" silently produced A4; it now
  asks. docSetup.ts is the pure half — units, resolution, presets, CMYK — and
  every control in the dialog changes something real.
  • A PIXEL HAS NO SIZE until a resolution is chosen, which is the whole reason
    DPI belongs in this dialog rather than buried in export settings. A
    MILLIMETRE does have one, and it never depends on the resolution — wiring
    mm through the DPI is the classic bug that makes a 300dpi A4 come out four
    times too big. Both are pinned by tests.
  • CHANGING THE UNIT DOES NOT CHANGE THE PAGE: the size is carried across at
    its physical value, so 210mm becomes 8.27in, not 210in.
  • PRESETS CARRY THEIR OWN RESOLUTION AND COLOUR MODE, because those are part
    of what "a business card" or "an Instagram square" means. presetIdFor tries
    the EXACT orientation before the swapped one — a 1080x1920 story and a
    1920x1080 frame are each other rotated, and an orientation-blind match
    reported whichever sat earlier in the list. A test caught that.
  • THE RESOLUTION IS REAL: exportPng used a hardcoded 2x (~144dpi). It now
    uses the document's own DPI, so a 300dpi print page stops exporting blurry.
  • THE COLOUR MODE IS REAL: pdfOverlayExport has ONE hexToRgb choke point, so
    a CMYK document now writes ink percentages into the PDF instead of light
    values — which is what a print shop expects to receive. Gradients follow
    separately (a shading dictionary names its own colour space and carries raw
    components), so a CMYK document does not end up with an RGB gradient inside
    it. It is a DEVICE conversion, not an ICC-managed separation, and the code
    says so rather than implying more.
  • The dialog shows the resulting PIXEL COUNT, which is the number its own
    controls hide and the one that decides whether an export is sharp or
    enormous.

- ✅ THE FOUR CURSOR STATES, AND WHAT THE FRAME IS FOR (2026-08-14).
  The owner specified the selection frame's behaviour exactly, from
  Illustrator: rotate just outside a handle, stretch on an edge handle,
  diagonal on a corner, and the plain arrow over the object itself.
  • ROTATION MOVED TO A BAND around the box and the floating grip-on-a-tether
    is gone. One grip can only be reached from one side, and the tether was
    part of the earlier "the frame is too big" complaint. The band is ONE path
    of two rings with fill-rule evenodd, so its middle is a hole and a click
    inside the box still reaches the move plate underneath. It is filled
    `transparent`, not `none`: an unpainted region takes no pointer events,
    which would make the whole thing inert.
  • THE ROTATE CURSOR IS DRAWN, because CSS has none. `grab` was standing in,
    and a hand says "drag me" rather than "turn me". It is a crescent with an
    arrowhead at each end, white-under-black so it reads on artwork of any
    colour, as a data URI with `grab` left as the fallback. The glyph turns to
    lie TANGENTIAL at the pointer's angle — one element cannot otherwise carry
    a cursor that means anything all the way round the box — and the angle is
    quantised to 15°, finer than the eye can tell at 24px and two dozen cached
    strings instead of one per pointermove.
  • THE OTHER THREE were already right and are now pinned: an edge handle maps
    to ew-/ns-resize, a corner to the diagonal pair, both rotating WITH the
    object so the arrow points the way the edge will actually move; Shift on an
    edge handle scales proportionally (resizeRotated's `aspect`); and the
    object itself keeps the plain arrow.

- ✅ A GROUP THAT WAS NOT ACTING LIKE ONE (2026-08-14).
  Reported as "the group is already broken apart — its parts move on a single
  click". The group logic lived in selectAnyById, but each object's OWN drag
  handler (beginShapeDrag, beginImageDrag, installDrag for text) called
  selectShape/selectImage/select directly and never went through it. The group
  therefore existed in the layers panel and nowhere else. All three now hand
  off to selectWholeGroup, which selects the whole group and starts a group
  drag — and does nothing inside isolation, where the members are meant to be
  ordinary objects again.

- ✅ ISOLATION MODE, AND ICONS AS GROUPS (2026-08-14).
  The owner's correction: elements whose details have GAPS between them should
  arrive as a group, and getting at one detail should be stepping INTO the
  group — not cutting it apart. That is Illustrator's isolation mode, and it
  is the right model.
  • MERGING ICON RUNS WAS THE WRONG ANSWER to the right problem. It made an
    icon draggable as one object, but it welded details that are visibly
    separate into geometry that then had to be cut apart again. An icon now
    inserts as one shape PER RUN, grouped. Same single-object handling, and
    every run stays separately selectable, recolourable and movable.
  • ISOLATION IS A READING MODE, NOT A DOCUMENT CHANGE. `isolated` holds one
    group id; everything outside it renders dimmed with pointer-events off, so
    there is nothing to hit by mistake, and inside it selectAnyById stops
    expanding to the group — the members are ordinary objects again, which is
    the entire point of having stepped in. Nothing about the model moves, which
    is why leaving is instant and cannot lose work.
  • The marquee and Select All are scoped to the isolated set too. Switching
    artboard leaves isolation (groups are per page), and ungrouping the group
    you are inside leaves it as well — otherwise every other object stays
    dimmed with no way back but Escape.
  • THE WAY OUT IS VISIBLE. A breadcrumb bar above the canvas — back arrow,
    artboard, group — because a mode with no sign that it is on is a mode the
    user gets stuck in. Double-click empty canvas, the arrow, the crumb, or
    Escape; all four work.
  • THE DOUBLE-CLICK HAD TO SEE PAST THE MOVE PLATE. The plate covers the
    selection, and the selection is exactly what a double-click is aimed at —
    a DOM hit test returned the plate and the gesture read as "empty canvas",
    so double-clicking a selected group EXITED instead of entering. It now
    falls back to hit-testing our own boxes. Double-click inside a text box
    still edits text rather than entering a group.

- ✅ THE MOVE PLATE, SPLIT, AND THE COLOUR PANEL (2026-08-14).
  • MOVING A STROKED OBJECT WAS A TEST OF AIM. An icon of three bars has
    almost no ink: the only way to grab it was to hit a 2pt line exactly, and
    the space between the bars belonged to the page. Once an object is
    SELECTED its whole box is now draggable — a transparent plate inside the
    handle overlay, drawn UNDER the grips so a grab on the edge still resizes,
    carrying `cursor: move` as the affordance. Only while selected, which is
    what keeps an unselected object from blocking clicks on whatever is behind
    it. Shift+click on the plate does not move: it forwards the point to the
    app, which hit-tests its own model — the plate covers the artwork, so a
    shift+click meant for the object underneath would otherwise never land.
  • MOVE IS ITS OWN PATH, not a resize with unchanged w/h. Routing it through
    applyBoxToShape would rebuild a path's `d` through the transform kernel on
    every frame, and a thousand identity round-trips at three decimals over
    one drag is a slow way to lose geometry.
  • SPLIT COULD NOT SPLIT THE ICON THAT PROMPTED IT. releaseCompound rejected
    any region with no extent on one axis — which is every horizontal bar,
    every rule, every hairline divider. With all three regions rejected the
    whole shape fell through to "nothing to split", on exactly the artwork the
    command was most useful for. A region is now rejected only if it is a
    POINT, and the rebase is a plain shift rather than a box-to-box transform,
    because the transform kernel refuses a source box with a zero side. 12
    tests, including the donut that must NOT come apart.
  • It is called «تقسيم» now, not «فصل المسارات» — the owner's own word, and
    not jargon.
  • THE COLOUR PANEL WAS REBUILT. The picker's out-of-gamut area was
    TRANSPARENT over a checkerboard, which read as a rendering fault rather
    than as "the screen cannot show this"; it is a flat neutral now, with a
    caption saying what the shape means. Contrast shows the colour ON the
    background at real text size with the verdict in plain Arabic and a choice
    of background, instead of a bare ratio the user has to go and look up. The
    cursor is a two-ring marker and the hue slider a real knob — a white
    hairline vanishes over yellow. Sections carry headings, the panel has one
    type scale and one control style, and the dock widened to 288px.
  • AND IT COULD NOT SAVE A COLOUR. It generated whole scales and extracted
    palettes from images, but the one colour just picked survived only until
    the cursor moved. There is a Save button now, and the swatch grid says
    what would fill it when empty rather than showing nothing.
  • The studio button style is scoped to `#exelmj-design-studio`: the
    toolbar's `.dz-btn` is a transparent 30px icon button, and a bare rule
    would have silently restyled the whole top bar.

- ✅ THE RIGHT-CLICK MENU (2026-08-14). Illustrator's context menu, with only
  the entries this app can actually perform.
  • THE DECISION IS SEPARATE FROM THE MENU. contextMenu.ts is pure and takes a
    MenuState — selection size, clipboard, history depth, whether anything is
    grouped, whether one path is selected — and returns which entries are live.
    designApp holds only the labels and the handlers. That split is what makes
    "تأكد من انها فعالة" checkable: an entry enabled while its action refuses
    to run is the exact failure that makes a menu untrustworthy, and every rule
    is pinned by a test (15 of them).
  • AND THE HANDLERS ARE EXHAUSTIVE BY TYPE. menuAction() is a
    Record<MenuAction, …>, so adding an entry to the union without wiring it up
    fails to compile. The menu cannot ship an item that does nothing.
  • Cut / Copy / Paste / Duplicate · Undo / Redo · Group / Ungroup / Ungroup
    All · Arrange ▸ (front, forward, backward, back) · Expand / Expand
    Appearance · Edit nodes / Release · Select All · Delete. Cut was new — it
    is Copy then Delete, and Ctrl+X now exists beside Ctrl+C and Ctrl+V.
  • Right-clicking an object that is NOT selected selects it first, or the menu
    would be about whatever was selected before rather than the thing under the
    pointer. Disabled entries stay VISIBLE and in place: a menu whose rows move
    as the selection changes cannot be used from muscle memory.
  • Fixed to the VIEWPORT, not the page — the canvas scrolls under it — and
    closed by pointerdown, scroll, resize, blur or Escape. The submenu flips to
    the other side near the window edge.
  • Found while wiring it: applyState() (undo) cleared the single selection but
    not `multi`, so an undo that removed objects left the overlay measuring a
    frame around ids that no longer existed.

- ⚠️ INCIDENT, AND THE RULE THAT COMES OUT OF IT (2026-08-14). While replacing
  renderLayers() a patch script located the END of the region with a marker
  that no longer existed, fell back to a looser search, and deleted ~10
  unrelated methods with it: setZoom, gotoPage, exportWord, showTextHotspots,
  hideTextHotspots, focusBoxText, extractViaIllustrator, makeCover, paintCover,
  sampleBackground. There is no git here and no editor backup, so the only
  surviving copy was the MINIFIED bundle from the last build. All ten were
  rebuilt from it and verified objectively: string literals and numeric
  constants survive minification unchanged, so comparing those between the old
  bundle and the new one proves the logic was restored rather than
  approximated. Every one matched (the single reported difference is the
  minifier renaming `basename`). Comments were rewritten — those the bundle
  could not return.
  RULES NOW: a scripted region-replace ASSERTS on both markers and never falls
  back; and src/ is snapshotted to backups/ before structural edits
  (backups/src-2026-08-14-2103). A git repo here would make both unnecessary
  and is the standing recommendation.

- ✅ GROUPS, AND ILLUSTRATOR'S LAYERS PANEL (2026-08-14).
  • GROUPS ARE A SIDE-TABLE RECORD, not a container. StudioDoc.groups holds
    `{id, name, children[]}` per page and NOTHING moves into it: the flat
    arrays are untouched, so every renderer and exporter keeps working without
    knowing groups exist. All that changes is what a selection RESOLVES to,
    which is why grouping needed no new transform code — the multi-selection
    machinery added earlier already moves, scales and rotates a set.
    Ctrl+G / Ctrl+Shift+G, on e.code for the Arabic layout.
    grouping.ts holds the set arithmetic and is where the traps live: a group
    ABSORBS any group the selection touches (a leaf in two groups has no
    defined meaning), a group joins and leaves a shift-click selection as a
    UNIT (a half-selected group would tear in half on the next drag), and
    deleting artwork PRUNES the table (a group of one keeps selecting a
    phantom). 20 tests.
  • THE LAYERS PANEL IS ILLUSTRATOR'S. Selection is the TARGET CIRCLE on the
    right, not the row — which is what makes the row itself safe to press,
    because pressing it is how you drag it. Rows drag to reorder within their
    own band: the canvas paints shapes, then images, then text, three separate
    arrays, and a cross-band drop has no order to express so it is refused.
    The panel draws top-of-stack first, so a row dropped BELOW another lands
    EARLIER in the array — getting that inversion wrong is the classic layers
    bug where every drag moves the object the wrong way.
  • THE TRASH IS IN THE FOOTER and deletes THE SELECTION. The per-row ✕ is
    gone: a delete button on a row can only ever remove one object, and a user
    who just selected nine wants all nine. Group / ungroup sit beside it.
  • Groups appear as one row with a disclosure arrow, and their members are
    still listed underneath in their own paint order — because nothing moved.

- ✅ THE LEFTOVER MARK NEAR THE CORNER (2026-08-14). Reported as a shadow left
  where an icon had been. It was the icon KEYLINE guide: the icon panel opens
  on PRESETS[0] when the page is not an icon canvas, so opening that tab on an
  ordinary page drew a 24pt dashed square at the page origin, belonging to
  nothing the user could select, move or delete. The guides now require the
  page to actually BE an icon artboard, which cannot be inferred from the
  preset — the page has to be asked.

- ✅ SMALL ELEMENTS, GROUP TRANSFORMS AND EXPAND (2026-08-14).
  Reported: small elements are hard to control, icons in particular cannot be
  enlarged; there is no way to turn a stroked object into flat artwork; the
  stroke weight needs a slider. Four causes, three of them real defects.
  • A MULTI-SELECTION HAD NO TRANSFORM AT ALL. The overlay drew eight grips and
    a rotation grip around it, and applyOverlayResize/-Rotation only knew how
    to change ONE object — selectedShape() is null while a multi-selection is
    live, so both returned immediately. The grips were decoration. Since a
    library icon arrives as SEVERAL separate runs, that is the whole of "the
    icon cannot be enlarged". group.ts now carries the two operations
    (scaleInGroup, orbitInGroup + spinInGroup) and designApp snapshots the
    selection at gesture start, recomputing every frame from the snapshot —
    applying a scale or a rotation incrementally accumulates into visible drift.
    Text scales by the SMALLER factor: there is no per-axis transform on a text
    box, and using the larger one pushes the words outside the frame.
  • THE GRIPS BLANKETED SMALL ARTWORK. Eight 8px squares around a 4px object
    cover it completely: there is nowhere left to press to MOVE it, so every
    drag became a resize. The ring is now pushed OUTSIDE the object (gripPad /
    gripPoint in transform.ts) by a constant stand-off plus whatever it takes
    to hold a legible minimum around something tiny. The object's real box is
    untouched — this changes where grips sit, not what dragging one means.
  • …WHICH EXPOSED AN OLD ONE: the resize maths read the raw pointer, so
    grabbing a grip anywhere but its exact centre snapped the edge out to meet
    it. The gesture now records pointer-minus-true-handle-point at grab time.
    Without that fix the padded ring would have jumped the edge outward on the
    first move of every drag.
  • ICONS ARE MERGED ON INSERT. Runs sharing a stroke weight become ONE shape;
    a different weight stays its own. An icon the user must marquee-select
    before they can move it is not an icon, it is a pile of paths.
  • EXPAND, and Expand Appearance. shapes.ts gained shapeToPathD — every kind
    as path data in its own local frame — so Expand means the same thing for a
    drawn rectangle as for a traced curve. It runs over the WHOLE selection. A
    shape with both a fill and a stroke expands into TWO objects, as
    Illustrator does; merging them would destroy the ability to recolour either
    one. Expand Appearance additionally bakes the dash into geometry first
    (dashPathD in outline.ts): a dash is a rendering instruction, and outlining
    without baking it produces the outline of one unbroken run and the dashes
    silently vanish. The old single-path outlineSelected is gone.
  • TWO BUGS THE NEW TESTS CAUGHT ON THE WAY:
    (a) outlineStroke treated `Z` as punctuation. toCurves skipped it, so a
        closed run whose last point was not already its first never had its
        CLOSING edge offset — a rectangle expanded with three thick sides and
        one hairline. Pre-existing, and it applied to every closed traced
        region too.
    (b) the rounded-rect corner used one direction vector for both control
        points. A corner joins two DIFFERENT tangents, and the shortcut bent
        the curve outside the rectangle: a 100x60 box with a large radius came
        out 76.6pt tall instead of 60.
  • The stroke weight is now a slider AND a box driving the same property:
    dragging is how you find the weight that looks right, typing is how you
    match one you already know.

- ✅ SIX REPORTED FAULTS, AND WHAT EACH ONE ACTUALLY WAS (2026-08-14).
  The owner reported: the shadow does nothing and sits in the wrong panel; the
  pen belongs next to the pointer; the tracer emits shapes that are not in the
  picture; the trace panel should look like Illustrator's with a 200-colour
  palette that is real; colours do not change; pen drawings vanish when moved
  or rotated. Five were real defects, and every one of them is now pinned by a
  test.
  • THE SHADOW WAS NEVER DRAWN. shapes.ts painted it for the EXPORT, and the
    live SVG renderer knew nothing about it — switching it on changed the saved
    file and nothing on screen. Now an feDropShadow filter with an EXPLICIT
    userSpaceOnUse region: the default region is a percentage of the bounding
    box, which clips a wide shadow off a thin shape. stdDeviation is HALF the
    blur, because that is canvas's definition of shadowBlur and the exporter
    paints through canvas — the two have to agree or the PDF stops matching
    the screen. For a PATH the region is LOCAL: a path's own transform is the
    user space the region is measured in. `dash` was missing from the renderer
    for the same reason and is drawn now too.
  • AND CSS WAS OVERRIDING BOTH. `.dz-shape.selected` carried
    `filter: drop-shadow(0 0 0)` and `stroke-dasharray: none`, so selecting a
    shape flattened its dashes and killed its shadow — css beating a
    presentation attribute. The selection affordance is the handle overlay;
    the rule is now `paint-order` only.
  • ROTATION THREW A PATH TO THE PAGE ORIGIN. A path carries its POSITION in
    `transform=translate(x y)` because its `d` is local. Rotation was written
    with its own setAttribute('transform'), which REPLACED that translate. The
    drawing did not "disappear" — it jumped to 0,0 off the visible page. Both
    jobs now go through one composed attribute (shapeTransform), rotate first
    so a local point is placed before it is spun.
  • A FLAT PEN LINE EXPLODED WHEN RESIZED. A horizontal path is stored with
    h clamped to 0.01 so its box stays hit-testable; applyBoxToShape then
    scaled y by to.h/0.01 — thousands — and the line shot off the page. An axis
    with no extent now passes through at 1:1, which is also what a vector
    editor does with a flat path: a horizontal line has no height to stretch.
  • COLOURS DID NOTHING FOR TWO SEPARATE REASONS. (1) Fill and stroke were one
    if/else chain, so a path carrying BOTH painted its fill and dropped its
    stroke — recolouring a traced outline was invisible. They are decided
    separately now (shapePaint). (2) A GRADIENT outranks the flat fill when
    painting, so setting `fill` on a traced shape changed the swatch and the
    file while the artwork stayed put; choosing a colour now DELETES the
    gradient. The picker itself also needed showPicker(): the real
    <input type=color> is a 1px stand-in behind the swatch and Chromium
    ignores a synthetic click on an input that small.
  • THE TRACER LEFT ITS OWN PROGRESS ON THE CANVAS. Layers are drawn as they
    arrive; on a failure the catch block never took them down, and on an empty
    result the array was filtered without a redraw — so half-finished
    low-resolution vectors sat on top of the untouched picture. That is the
    "results that are not from the image". Every exit now runs one cleanup.
  • THE APPEARANCE INSPECTOR MOVED UNDER THE LAYERS LIST, where the owner
    asked for it: the layers aside is now a scrolling list plus a docked
    inspector, two children rather than one, because renderLayers() clears its
    own host on every redraw and would destroy an inspector mid-edit.
  • THE PEN SITS BESIDE THE POINTER in the top row — the pair a drawing
    session alternates between — and takes a crosshair cursor, since
    `.dz-shape { cursor: move }` otherwise wins while hovering a shape.

- ✅ THE TRACER: 200 REAL COLOURS, ILLUSTRATOR'S PANEL, AND A FROZEN
  RESTORE POINT (2026-08-14).
  • THE BACKUP IS ENFORCED, NOT FILED. backups/trace-working-2026-08-14/ holds
    the working engine, and tests/traceParity.test.ts runs BOTH copies on the
    same pictures and requires their SVG to match character for character.
    The backup cannot be deleted without the suite going red — which is the
    guarantee "حافظ على ما يفعله الترييس الان" actually asked for.
  • MAX_COLORS = 200, and it is real: the quantiser splits to that many
    clusters and every one becomes its own traced layer. The rescue pass keeps
    its old ceiling of 32 unless MORE was asked for, so a default trace is
    byte-for-byte what it was.
  • THE COST WAS QUADRATIC. Each layer was matched against the whole palette,
    and the number of layers IS the palette size. StackedFields (isoContour.ts)
    exploits the stack's shape instead: the OUT set only grows, which a running
    minimum tracks in O(1) per pixel per layer; the IN set only shrinks, so its
    suffix minima are snapshotted every blockSize layers on ONE backward pass
    and a layer scans at most blockSize colours to close the gap. Measured on a
    600x440 picture: 32 colours 2.7s, 100 colours 6.2s, 200 colours 10.5s —
    where the old engine was 2.4x slower at 32 alone. No output value moved.
  • THE RASTER SCALES WITH THE PALETTE (traceCap): 2000px at or below 32
    colours — exactly what it always was, so nothing normal changed — then
    2000*sqrt(32/n), floored at 700. The Info block SHOWS the resolution,
    because a cost the user cannot see is a cost they blame on the wrong thing.
  • THE PANEL IS ILLUSTRATOR'S LAYOUT IN A LIGHT SKIN: quick-mode strip,
    Preset / Mode / Palette-or-Threshold, an Advanced fold, Create, the
    ignore-colour eyedropper, an Info readout, and a footer that does not
    scroll. Sliders carry Illustrator's two end captions and a typed value box.
    What is NOT there is deliberate: Method, Transparency, Shapes and
    Auto-Grouping have no counterpart in a stacked-layer tracer, and a control
    that does nothing teaches the user to distrust the whole panel. `snapLines`
    was already implemented and unexposed — it is now a real checkbox.
  • Illustrator's "Paths" slider runs the OPPOSITE way to our RDP tolerance,
    so the value is mirrored on the way in and out rather than the label being
    quietly reversed.

- ✅ THE ILLUSTRATOR TOOL PALETTE, THE SWATCH, AND THE APPEARANCE INSPECTOR
  (2026-08-14). Ten tools on two columns, the nested fill/stroke swatch, and
  the properties the owner named: shadow, corners, opacity, stroke, pen.
  • TEN TOOLS IN A 5x2 GRID (#exelmj-design-tools, 76px). One column of ten is
    a scrolling strip; the eye reads a two-column block far faster, which is
    why every vector editor is laid out this way.
    select V · node A · rect M · ellipse L · line \ · pen P · text T ·
    image O · eyedropper I · trace Q.
    Three of the ten are ACTIONS, not modes (image opens a picker, trace opens
    its panel, node enters the path editor), so pickTool() routes them without
    leaving the palette showing a mode the canvas is not in.
  • THE SWATCH is Illustrator's: a filled square with an outlined square
    overlapping it, and WHICH ONE IS IN FRONT is which one the colour controls
    edit. Clicking a back box brings it forward; clicking the front one opens
    the picker. X switches, Shift+X swaps — the standard bindings.
    The stroke box draws a RING rather than a solid, because that is what
    "stroke" means. "None" is the diagonal red slash every vector tool uses; a
    white chip would read as white paint. Clearing BOTH colours is refused —
    a shape with neither is invisible AND unselectable.
  • THE APPEARANCE INSPECTOR under the palette: opacity, stroke width, corner
    radius, dashed stroke, and a shadow with blur / x / y / strength. Only the
    rows that APPLY are shown — a corner-radius slider on an ellipse is a
    control that does nothing, which teaches the user to distrust the panel —
    and the shadow's four controls appear only once the shadow is switched on.
    Edits apply to EVERY selected shape; the value shown comes from the first.
  • Shape gains `shadow` and `dash`, both v4-optional and absent at their
    default. A transparent shadow, a zero-offset zero-blur shadow, and an
    all-zero dash are all DROPPED rather than recorded as invisible features.
  • A REAL BUG, caught by its own test: usesV4Features lives in
    overlayModel.ts, and the edit adding shadow/dash to it silently matched
    nothing (String.replace with no match is a no-op). A document with a shadow
    would have been written as `"version": 3` — and v0.3.0, whose cleaner does
    not know the field, drops it on open. That is DATA LOSS, not a cosmetic
    mistake, and the comment on that function now says so.
  • THE PEN is click-to-place, not drag-to-draw: a drag produces a freehand
    scribble with hundreds of nodes, and this canvas is for shapes somebody
    will later edit node by node (M2's editor). Click the FIRST point to close
    (marked, because the user has to aim at it), Enter to finish open, Escape
    to abandon. An OPEN path commits as a STROKE and a closed one as a FILL —
    filling an open run paints a meaningless sliver across its mouth.
  • Every new binding matches on e.code, not e.key. Same reason as always: this
    user's keyboard is Arabic, so e.key for V is 'ر' and for A is 'ش'.
  • Tests: appearance.test.ts (18). Suite 910 -> 928, all green; tsc clean;
    build clean; app relaunched and confirmed live through MCP.

- ✅ MULTI-SELECT AND THE FIGMA/CANVA INTERACTION SET (2026-08-14).
  The owner asked for marquee selection, for the features similar tools have,
  and could not find the embedded browser. All three addressed.
  • WHY THE BROWSER WAS "MISSING": it was there, as one of TWENTY-FOUR toolbar
    buttons in a wrapping wall. The five Studio tabs are now ONE segmented
    control (.dz-studio-tabs). A feature nobody can locate is a feature that is
    not there.
  • src/design/marquee.ts — drag a band, select what it touched, move the lot.
    INTERSECTION, NOT CONTAINMENT: a user sweeping a band across a row means
    the objects they swept over. Requiring containment makes large objects
    nearly unselectable and is the most common complaint about hand-rolled
    marquees.
    Selectables fold ROTATION into their bounds, so a turned object is hit
    where it actually is. Text boxes were the trap: a RIGHT-aligned box grows
    LEFTWARD from its anchor and a centred one grows both ways, so using the
    anchor as the left edge puts two of the three alignments in the wrong
    place. An auto-width box gets a readable estimate rather than a zero-width
    box the marquee could never touch.
    A drag under 3pt is a CLICK THAT WOBBLED, not a marquee.
  • Multi-selection is a separate mode from single selection and they never
    overlap: the group frame is the union of ROTATED member bounds and offers
    no rotation or crop (per-object operations with no group meaning yet),
    members are marked individually as well as framed, and grabbing any member
    drags the whole group.
  • Shift+click adds/removes — and folds an existing SINGLE selection in first,
    so shift-clicking a second object gives two rather than one.
  • src/design/align.ts — align and distribute, the two operations every design
    tool is judged on. TWO RULES: alignment MOVES, never resizes; and
    distribute spaces the GAPS, not the centres — evenly spaced centres look
    wrong the moment objects differ in size, which is what the eye reads. The
    outermost two stay put, because moving them would make "distribute" also a
    "resize the arrangement". Tests assert equal gaps AND deliberately unequal
    centre spacing.
  • SMART GUIDES while moving (Figma's signature): snapBox already existed and
    was only used for resize. Edges and centres now snap while dragging, the
    matched line is drawn, and Ctrl suspends it. The guides live in the shape
    layer and are cleared per frame — appending them to the layer being
    redrawn on every pointermove is how they vanish.
  • Z-ORDER on Figma's own bindings (Ctrl+] / Ctrl+[, Alt for all-the-way),
    plus buttons. A multi-selection KEEPS ITS INTERNAL ORDER when it moves —
    scrambling a group's stacking while raising it rearranges artwork the user
    did not touch. Steps CLAMP at the ends rather than wrapping.
  • Ctrl+A select all, Ctrl+D duplicate, Ctrl+C/V an internal clipboard
    (the OS clipboard would lose the bitmaps images carry), arrow-key nudge at
    1pt / 10pt with Shift, Escape to clear.
    EVERY shortcut matches on e.code, not e.key — this user's keyboard is
    Arabic and e.key for the A key is 'ش'. That lesson is already in this file
    from the undo/redo work and applies to every binding added since.
  • Tests: marquee.test.ts (29), align.test.ts (19), zorder.test.ts (13).
    Suite 846 -> 894, all green; tsc clean; build clean; app relaunched and
    driven live through the MCP tools from Claude's side.

- ✅ FIRST LIVE RUN — TWO REAL DEFECTS FOUND AND FIXED (2026-08-14).
  Everything below was invisible to 846 unit tests and appeared in the first
  60 seconds of actually running the app. This is the entry that justifies
  running it.

  1. CRASH ON WINDOW CLOSE — "TypeError: Object has been destroyed", an
     uncaught exception in the MAIN process, which Electron shows as a crash
     DIALOG rather than a log line.
     • REPORTED BY THE OWNER against the INSTALLED v0.3.0 build (02:27), which
       contains none of the Studio work — verified by extracting app.asar and
       grepping its main.cjs for `startMcpServer|registerBrowserIpc|studio`:
       zero hits. So this was a PRE-EXISTING bug in the multi-window feature,
       not a regression from this session. Fixed here regardless.
     • ROOT CAUSE, electron/main.ts: `w.on('closed', () => dirtyByWc.delete(
       w.webContents.id))`. Electron fires 'closed' AFTER the native window is
       destroyed, and every native accessor throws from that moment. The id is
       now captured at CREATION (`const wcId = w.webContents.id`).
     • THE SAME BUG EXISTED IN MY OWN CODE and would have crashed the app the
       first time a window with an open mini-browser was closed:
       browserIpc registered teardown on 'closed', and StudioBrowser.destroy()
       reaches win.contentView through hide(). Teardown moved to 'close'
       (singular, window still alive); 'closed' now only drops the JS
       reference. hide()/show() also guard on win.isDestroyed(), because an
       uncaught throw in main is a crash dialog, not a log.
     • REGRESSION PREVENTION, tests/mainProcessSafety.test.ts: this class of
       bug needs a real Electron window and cannot be unit-tested by
       behaviour, so it is caught STATICALLY — the test parses every
       `.on('closed')` handler body in the three main-process files and fails
       on any native accessor (webContents / contentView / getBounds / ...).
       It also asserts the CHECKER detects the exact shipped bug, so a broken
       checker fails loudly instead of passing everything.

  2. EVERY MCP TOOL CALL HUNG — 60 seconds, then a timeout.
     • ROOT CAUSE: installMcpBridge() ran in DesignApp.mount(). The app boots
       in SHEET mode and designApp is imported LAZILY, so until the user
       happened to open the design page there was no listener in the renderer
       and main waited out its full timeout. Measured live: initialize 53ms,
       tools/list 4ms, tools/call 6000ms+ (aborted).
     • FIX: the listener is registered at renderer BOOT (src/main.ts), and
       resolves the document view from the design app only if it has already
       been loaded. It deliberately does NOT force that page to load —
       mounting a page because Claude asked a question would hijack the user's
       screen. Tools needing a document answer NO_DOCUMENT; colour maths and
       device info answer regardless.
     • VERIFIED LIVE against the running app over real HTTP: studio_status
       45ms, check_contrast 7ms (4.48 / "AA Large" / suggested fix),
       make_scale and describe_design correctly NO_DOCUMENT, browser tools
       UNSUPPORTED, unknown tool NOT_FOUND, and an unauthenticated request 401.
       Clean quit removes the connection file, so a client reports "not
       running" rather than "connection refused".

- ✅ FOUR FEATURES THAT WERE BUILT BUT UNREACHABLE (2026-08-14). Found by
  auditing what the UI actually CALLS rather than what exists. A feature with
  no way to invoke it is not delivered, however well it is tested.
  • THE HANDOFF EXPORT had no button anywhere. bundle.ts and handoff.ts were
    complete and tested since M9 and reachable only through MCP — which itself
    returned the file CONTENT and had nothing on the writing end. Two toolbar
    buttons now export the ZIP and the Markdown.
  • AUTO-LAYOUT FRAMES were not drawn. The layout panel edited them and the
    engine arranged their children, but the frame itself was invisible, so the
    panel read as though it had done nothing. Drawn now as a non-printing
    outline, pointer-events:none — a frame the user can grab is a frame they
    will drag away from its children.
  • THE MINI-BROWSER could not open OUR OWN projects. studio:// serving and its
    path-containment guard were built and tested, and `studioServeProject` was
    never called from anywhere — so the only thing the browser could point at
    was somebody else's website, which is the opposite of the point.
  • THE TRACE PREVIEW counted layers instead of showing them. The worker has
    emitted each colour as it finishes since M5, and designApp turned that into
    a percentage string. Layers are now DRAWN as they arrive, then removed
    before the committed result is built from the final paths at the real
    scale — provisional artwork must not survive as duplicates underneath.
    tracedToShape() was extracted so the preview and the commit share ONE
    converter: two would mean the preview showed something the commit did not
    reproduce, which is the one promise a preview has to keep.

- ✅ ALL 5,425 FREE ICONS NOW SHIP (2026-08-14). The 132-icon library was a
  CURATION choice about file size, never a licence limit — every icon in
  @hugeicons/core-free-icons is MIT and all of them are now bundled.
  • The PRO icons are a different matter and there is nothing to download:
    `@hugeicons/hugeicons-pro` on npm is, by its own description, a "pro
    installer and license verifier" — it ships no artwork and fetches nothing
    without a purchased key. So "just download them all" has no mechanism, not
    merely a legal objection.
  • pick-icons.mjs now emits every icon, with the hand-picked 132 PINNED to the
    front and the rest alphabetical (`pinned` records the split). The picker
    shows the pinned head by default and searches the whole library — and says
    "search to reach all 5,425" rather than showing 132 as if that were all.
  • LAZY BY NECESSITY: 4.4 MB of JSON. A static import put it in the design
    module's chunk and made every document pay for a panel most never open, so
    iconPanel dynamic-imports it on first render. Vite emits it as its own
    4.3 MB chunk (hugeicons-*.js) loaded only when the icon tab opens.
    A missing library reports "not built — run the icon script" rather than
    showing an empty grid that reads as "no icons exist".
  • A TEST THAT WAS MEASURING THE WRONG THING, caught by expanding the set:
    "every path fits the 24 grid" asserted against pathBBox, which is the
    CONVEX-HULL bound — a Bezier control point legitimately sits outside the
    curve it steers. Measured across the whole library the hull spans
    -1.83..26.08 while the DRAWN artwork spans 1.00..23.00, so the hull test
    failed a perfectly good icon (Fire, at 26.08). It now flattens the curve
    and asserts what is actually rendered.
    The rewrite also had to accumulate the extremes and assert ONCE: an
    expect() per sampled point is ~2 million calls, which timed out at 5s and
    would have reported the first failure rather than the worst.

- ✅ M10 — THE REMAINING PANELS: ICONS, TEMPLATES, LAYOUT (2026-08-14).
  The Studio dock is now five tabs and every engine built earlier has a face.
  • ICONS — src/studio/iconPanel.ts. The PREVIEW STRIP is the feature, not
    decoration: an icon is the one drawing whose final size somebody else
    picks, drawing at 24 and shipping at 16 is the normal case, and the
    difference between crisp and soft is invisible at authoring size. The strip
    renders the same artwork at 16/24/32/48/128 on every commit. The validator
    does the half the eye cannot — it NAMES the offending node and the size.
    It also states which sizes CAN be crisp (integerScaleSizes), because a
    24-grid glyph is only pixel-perfect at integer multiples of its grid and
    flagging 16 and 20 would be flagging arithmetic.
  • THE BUNDLED ICON LIBRARY (the owner's suggestion, hugeicons-animated.com).
    IMPORTANT LICENCE DISTINCTION: Hugeicons ships 54,000+ icons of which only
    the ~5,400 in @hugeicons/core-free-icons are MIT — the rest need a paid Pro
    licence. And hugeicons-animated.com itself is React + Motion components,
    which would drag a framework into a deliberately framework-free canvas. So
    we take the FREE package's raw path data and none of its React.
    scripts/pick-icons.mjs READS the licence from the installed package and
    EXITS NON-ZERO on anything not on the permissive list, plus a second guard
    that the package name contains "core-free-icons". A hand-copied "it's MIT"
    note would not notice the day that changes, or the day someone installs the
    Pro package instead. Output: 132 icons, 82 KB, from 18 MB / 5,443 modules.
    A BUG THE TEST CAUGHT: the extractor's fallback lookup strips a trailing
    "Icon", so "PrinterIcon" and "Printer" resolved to the SAME file and the
    library shipped 135 entries with 132 unique names — which would have made
    "insert by name" ambiguous. Deduped by resolved file.
    tests/iconLibrary.test.ts asserts the PROVENANCE (MIT, core-free-icons, not
    pro) and that every one of the 132 icons survives the path kernel — an icon
    that cannot normalise cannot be node-edited.
    HUGEICONS is a real preset (24 grid, 1.5 stroke, round caps) so an inserted
    icon is validated against the rules it was DRAWN to, not Material's 2pt.
  • Icon guides are drawn FIRST in the shape layer and carry no data-shape
    attribute, so nothing can select, move, delete or export them. A guide that
    behaves like a shape is a guide the user accidentally ships.
  • TEMPLATES — src/studio/templatePanel.ts. Save a selection, place it, export
    it as a file somebody can email, import one back. Deleting a definition
    reports HOW MANY instances went with it, and deliberately leaves the
    already-expanded objects alone: they are ordinary shapes now, and silently
    deleting artwork the user can see would be the worst reading of "remove
    template".
  • LAYOUT — src/studio/layoutPanel.ts. Direction, gap, padding, justify,
    align, wrap and flow direction, applied live.
    THE CONTRACT THAT MAKES FRAMES CHEAP, now pinned by tests/layoutApply.test.ts:
    layout RESOLVES TO ABSOLUTE POINTS. After applyFrameLayout the flat arrays
    hold plain coordinates, so PDF, SVG, PNG and Word exporters keep working
    with no knowledge that a frame exists. The tests assert idempotence, RTL
    mirroring without resizing, a line keeping its SIGNED delta, and a path's
    `d` actually growing under stretch rather than only its origin moving.
    Frames default to `dir: rtl` when the app is Arabic — defaulting to ltr
    would mean every frame needs fixing after it is made.
  • Tests: iconLibrary.test.ts (10), layoutApply.test.ts (12), plus a Hugeicons
    preset case. Suite 813 -> 836, all green; tsc clean; build clean.

- ✅ M8c — THE PICKER BRIDGE CLOSES THE LOOP (2026-08-14). An element picked in
  the embedded browser now lands on the canvas as editable objects, and the
  browser MCP tools do real work.
  • A BUG FIXED FIRST: the Studio dock mounted the colour panel and the browser
    panel into the SAME container and both toggled the same `hidden` flag —
    opening the browser after colours stacked them, and closing either hid
    both. The dock is now TABBED with one host per tab. This is not cosmetic:
    the browser tab hosts a NATIVE view that paints above all renderer DOM, so
    leaving it mounted while another tab shows would cover that tab with a web
    page. Every switch away from `browser` hides the native view, not just its
    container.
  • src/studio/captureImport.ts — the conversion, extracted from designApp so
    its rules are unit-tested rather than buried in DOM code. TWO RULES GOVERN
    IT, and both are the kind of error that is hardest to notice because the
    result looks like a design either way:
    1. CSS PIXELS ARE NOT POINTS. The web is 1/96in, the canvas is 1/72in.
       Importing px as pt shrinks everything by exactly 25%, uniformly — which
       reads as a deliberately smaller design and survives review. pxToPt has a
       test asserting it is NOT the identity.
    2. NEVER INVENT. A transparent background is not black (it gets an empty
       fill plus a faint outline so it stays SELECTABLE — a shape with neither
       fill nor stroke is invisible AND ungrabbable). A child with text but no
       recorded box is SKIPPED rather than stacked at the origin. A dropped box
       shadow, an un-downloaded background image and every skipped child are
       REPORTED in `degraded`, which flows into the handoff's "Not specified".
    Direction comes from the CAPTURE, never from the app being Arabic: an LTR
    element rebuilt as RTL is wrong in a way that looks deliberate.
  • The browser MCP tools are now REAL: browser_open, browser_set_device (it
    reports what the page now believes — w/h/dpr/touch/mobile — and suggests a
    valid device when given a bad one), browser_screenshot (a PATH, never
    bytes), picker_pick and picker_import. runStudioTool became async and the
    renderer bridge awaits it.
    picker_pick deliberately CANNOT arm-and-click on the model's behalf: it
    returns the last USER pick, and says so when there is none. The reason is
    in guestPreload.ts — an Electron-synthesised click is TRUSTED, so a picker
    that could click could really submit a form.
  • The "Add to canvas" button is disabled until something is actually picked;
    a button that answers "nothing to import" on every press teaches the user
    to ignore the status line.
  • Tests: captureImport.test.ts (30), plus mcpHandlers.test.ts rewritten
    (37 -> 45) — the five "not wired yet" tests were obsolete once the tools
    worked and were replaced with real coverage of each one, including the
    failure paths (BLOCKED url, DevTools blocking the device change, nothing
    picked yet). Suite 775 -> 813, all green; tsc clean; build clean.

- ✅ M8b — THE MINI-BROWSER PANEL AND THE PICKER (2026-08-14). The last
  milestone: an embedded browser with real device switching, and a read-only
  element picker that feeds the canvas.
  • THE ONE STRUCTURAL FACT that shapes the panel: a WebContentsView is a
    NATIVE child of the window and paints ABOVE all renderer DOM. No CSS can
    put anything on top of it. So src/studio/browserPanel.ts is a frame around
    a HOLE — `.dz-bw-hole` is a placeholder whose measured rectangle is sent to
    main on every layout change, and every control lives OUTSIDE that
    rectangle. A ResizeObserver plus window resize and panel scroll keep it in
    sync; hiding the panel MUST hide the view, or it goes on painting over
    whatever is now in that part of the window.
  • Three device pills with drawn SVG icons (desktop / tablet / mobile), plus
    rotate. Opening a page RE-APPLIES the device, because a fresh document
    starts with no emulation — a page opened while "mobile" was selected would
    otherwise silently be a desktop.
  • electron/studio/guestPreload.ts — the picker, as a PRELOAD rather than an
    injected script. It runs before any page script in an ISOLATED world that
    shares the DOM but not the page's globals, so the page cannot patch what we
    read and there is no injection-timing fight — the extension this replaces
    spent a whole subsystem on that fight (version handshake, liveness probe,
    PING/inject dance) and none of it is needed here.
    READ-ONLY BY CONSTRUCTION: it hovers, highlights and reads, and there is no
    code path that clicks, types, submits or navigates. In Electron a
    synthesised click is TRUSTED — the page cannot tell it from the user's — so
    a picker that could click would be one that could really submit a form or
    really buy something. The capability is ABSENT, not guarded.
    The four-layer box-model overlay lives in a CLOSED shadow root on a 0x0
    fixed host (sizing the host would make it a hit-testing obstacle over the
    whole page), uses `outline` not `border` (a border would change the box
    being measured), and reads getBoundingClientRect VERBATIM because the
    layers are position:fixed — no scroll arithmetic, which is where this kind
    of overlay usually drifts.
    selectorFor prefers a TEST ATTRIBUTE over an id: framework ids (useId,
    input-1234) are volatile while a test attribute is a promise someone made
    on purpose. semanticClasses rejects utility CSS by SHAPE
    (/^-?[a-z]{1,3}-[\d.\-/]+$/ catches p-4, mt-2, w-1/2 with no framework
    dictionary) and hashed CSS-module classes, because the first is shared by
    hundreds of elements and the second changes every build.
    Unlike the extension, the capture DOES export per-node geometry for up to
    60 children — that omission is what forced the extension's importer to
    re-run layout to recover boxes it never recorded.
  • electron/studio/browserIpc.ts — one browser PER WINDOW in a WeakMap, every
    handler resolving the caller's window from the event. A handler using the
    focused window would drive the wrong preview the moment a second window is
    open, which EXELMJ supports. The consent dialog NAMES the origin: a yes/no
    with no origin in it is not consent to anything in particular. Screenshots
    return a PATH, never bytes.
    The pick is relayed to the window that ARMED it — with two windows open a
    shared channel would deliver the capture to the wrong one.
  • guestPreload is a THIRD esbuild entry point: it runs inside the previewed
    page in its own isolated world and must not share a bundle with the app's
    own preload.
  • A capture becomes a CaptureRecord carrying its provenance AND what could
    not be reproduced (missing child geometry, an un-downloaded background
    image), so the handoff states the uncertainty rather than presenting a
    guess as a measurement. cssColorToHex returns '' for a TRANSPARENT colour
    rather than black — painting a transparent background black is the most
    visible way an import can be confidently wrong.
  • Suite 775, all green (verified over three consecutive full runs); tsc
    clean; `npm run build` clean with all four bundles emitted.

- ⚠️ ENVIRONMENT, not code: the C: drive was down to 20 MB free during this
  session, and an ENOSPC during a test write produced a spurious failure in the
  ZIP determinism test. The same test passes 3/3 in isolation and the full
  suite passes 3/3 with TEMP redirected to a drive with space. If builds or
  tests fail oddly, check free space on C: FIRST.

- ✅ M8a — THE EMBEDDED BROWSER'S FOUNDATIONS (2026-08-14). The device model,
  the URL policy and the offline serving layer are built and tested; the
  renderer panel that shows the view is the remaining piece (M8b).
  • src/studio/devices.ts — A DEVICE IS MORE THAN A WIDTH, and that is the
    whole reason this file exists. Making the preview narrower is not
    previewing a phone: a phone reports a device pixel ratio (so 2x images and
    image-set() resolve differently), a coarse pointer (so `@media
    (pointer: coarse)` and `(hover: none)` match, which is what turns a hover
    menu into a tap menu), and a mobile user agent (which server-side and JS
    feature detection key off). A viewport that lies about those three shows a
    desktop layout squeezed into a phone width — the exact bug the switch
    exists to catch.
    emulationCommands() is DATA, not calls, so the mapping from "the user
    pressed the phone pill" to "what the page believes" is unit-tested without
    Electron. setDeviceEmulationParameters is deliberately NOT used: it resizes
    the viewport but sets neither touch nor the user agent.
    custom() has NO `base` parameter — a caller spreading one device over the
    classified result is exactly how a 360-wide "custom" ends up reporting no
    touch, which a test caught while the parameter still existed.
  • electron/studio/browserView.ts — WebContentsView, not <webview>: the
    renderer cannot reach webContents.debugger on a <webview>, which kills
    every CDP capability the device switch depends on. The cost is honest — we
    own the layout and the view paints ABOVE renderer DOM, so a modal that must
    cover it calls removeChildView rather than trying to out-z-index it. Owned
    PER WINDOW, because EXELMJ has a `windows` Set and a globally-owned guest
    would be silently stolen by whichever window opened one last.
    Only ONE debugger client may attach, so a user with DevTools open makes
    setDevice fail — it REPORTS that rather than silently degrading to a resize.
    Per-origin consent is session-only: an approval that outlived the session
    would be a standing grant nobody remembers giving.
  • electron/studio/studioProtocol.ts — `studio://<projectId>/<path>`, a
    privileged custom scheme. NOT a dev server (a port, a Windows firewall
    prompt, and something anything else on the machine can reach) and NOT
    file:// (an OPAQUE origin: no localStorage, no IndexedDB, no modules
    without CORS pain, no secure context — so the project behaves completely
    differently the moment it is deployed to https://, at the worst possible
    time to find out).
    registerSchemesAsPrivileged MUST run before app-ready; it is refused after.
    resolveStudioPath IS the security boundary and is tested as one: traversal,
    ENCODED traversal (%2e%2e), an absolute path, a NUL byte, malformed
    percent-encoding, and the classic string-prefix bug where a sibling
    directory named `demo-evil` passes a `startsWith(root)` test. path.relative
    is used precisely because a prefix test does not.
    Every text type declares charset=utf-8 — a missing one mangles Arabic — and
    an unknown extension falls back to application/octet-stream rather than
    guessing, because a mistyped script is either refused or, worse, executed
    as something it is not.
  • Tests: browserPolicy.test.ts (12), studioProtocol.test.ts (17).
    Suite 746 -> 775, all green; tsc clean; `npm run build` clean.

- ✅ M9 — DELIVERY: MCP, ZIP BUNDLE AND MARKDOWN HANDOFF (2026-08-14).
  Claude can now drive Studio, and a design can leave the app in a form another
  agent can rebuild from.
  • THE GOVERNING RULE of the handoff format, and the reason it looks the way
    it does: AN ABSENT FACT MUST BE LOUDER THAN A WRONG ONE. The failure being
    designed against is confident silent wrongness — points read as pixels give
    a uniform 25% error that reads as a design choice; a capture with no
    per-node geometry gets invented flex values that still measure the right
    outer box; an LTR capture is faithfully rebuilt with `margin-left` in an
    Arabic-first product. So the spec DECLARES its units and origin, declares
    direction as a `dir` ATTRIBUTE (CSS `direction` alone does not match
    `:dir()`), demands logical properties, and carries a "Not specified"
    section that names what was never decided. When there are no auto-layout
    frames it says so in those words and warns that regular-looking spacing may
    be coincidence.
    Structured data is FENCED JSON, not Markdown tables: a truncated table
    still parses as a table and is quietly wrong, while truncated JSON fails
    loudly — which is the behaviour we want.
  • MCP ARCHITECTURE, and why it is not negotiable: the server runs INSIDE the
    Electron main process over Streamable HTTP on 127.0.0.1. Electron's
    utilityProcess CANNOT use stdio (its docs state configuring stdin to
    anything but 'ignore' is unsupported), so a stdio server cannot live in
    one; and every tool needs a live webContents plus the open document, both
    of which are in main. Claude Code speaks stdio, so scripts/mcp-shim.mjs
    bridges stdio to the local endpoint and reports "EXELMJ is not running"
    instead of hanging.
    LOOPBACK IS NOT AN AUTHORIZATION BOUNDARY — any local process can reach
    127.0.0.1 — so a per-launch 32-byte bearer token is written to
    <userData>/studio/mcp.json at mode 0600 and required on every request. No
    CORS headers at all, deliberately: adding one is exactly how a web page
    would reach the user's design tool.
  • A REAL BUG the live test caught: `server.close()` only stops ACCEPTING and
    then waits for open connections. An MCP client holds a keep-alive socket
    for the whole session, so without `closeAllConnections()` app quit hung on
    a client that was merely idle.
  • TWO DELIBERATE ABSENCES in the tool surface, both security decisions:
    there is NO picker.click and NO picker.type (a tool that clicks arbitrary
    things on the user's logged-in pages is the worst version of the automation
    problem), and no tool returns raw image BYTES — screenshots return a PATH,
    because a base64 PNG of a 1440x900 page is megabytes of context for
    something the client can read from disk.
    Tools that are not wired yet FAIL with UNSUPPORTED and say so; an empty
    success is worse than an honest refusal.
  • src/studio/bundle.ts — the ZIP, on the jszip already in the project.
    Deterministic by construction: entries sorted, mtime pinned to the 1980 ZIP
    epoch, nothing reads the clock (generatedAt is passed IN). Two exports of
    an unchanged design are byte-identical, which is what makes "what changed"
    answerable. Our own reload file is QUARANTINED under source/ so nothing
    confuses it for the spec. An SVG asset is emitted only when it actually
    contains a path — counting path shapes first would list an asset whose
    every path was then dropped by the safety guard.
  • Files: electron/studio/mcpProtocol.ts + mcpServer.ts, scripts/mcp-shim.mjs
    (copied into dist-electron by the build so electron-builder ships it),
    src/studio/{handoff,bundle,mcpHandlers,devices}.ts, .mcp.json.
    main.ts starts the server on ready and tears it down on will-quit; tool
    calls are forwarded to the focused renderer on a PER-CALL reply channel
    (a shared one would let one answer resolve another's promise).

- ✅ M6 + M7 — AUTO-LAYOUT AND TEMPLATES (2026-08-14).
  • src/studio/layout.ts — the flexbox subset a UI designer actually uses,
    hand-rolled rather than embedding Yoga/Taffy: one axis, gap, padding, two
    alignment axes, wrap and three sizing modes is ~200 lines, and shipping a
    WASM binary into a lean offline app to avoid writing tested lines is the
    wrong trade. Explicitly NOT a CSS engine — no percentages, no min/max, no
    baseline, no grid — and every one of those absences is a thing that cannot
    be subtly wrong.
    RTL IS FIRST-CLASS and the mirror is applied at the END over final
    positions, so every rule above it stays written once in logical order.
    ONLY A ROW MIRRORS: a column stacks top-to-bottom in both directions, and
    flipping it is the single most common RTL bug in layout code — pinned by a
    test that asserts the column is identical in both directions.
    dropIndex() is what makes auto-layout feel like layout: dragging a child
    inside its frame REORDERS instead of moving, and under RTL "passed the
    midpoint" means the other way. reorder() carries the off-by-one that makes
    a drag to the very end land last rather than second-to-last.
    frameToCss() emits LOGICAL properties only, so one design serves both
    directions with no mirrored stylesheet.
  • src/studio/template.ts — a template is ONE self-contained
    *.exelmj-tpl.json file: no database, no index, no server. It can be
    emailed, dropped in a folder, and used.
    defFromSelection REBASES to (0,0) — a template that remembered where it was
    drawn would place itself back there every time.
    expandInstance NAMESPACES every id with the instance id, so placing one
    definition twice cannot produce two objects claiming the same id and making
    the layers panel, selection and undo disagree about which the user meant.
    An override may change TEXT, a hex FILL, or a data-URL image and nothing
    else — an override that could move things would let an instance silently
    diverge from the definition's layout. A non-hex colour and a remote image
    URL are both rejected.
    expandPage REPORTS a missing definition instead of substituting a
    placeholder, which would look like a design decision.
    wouldCycle() runs before a save: a cyclic template turns expansion into an
    infinite loop that hangs the renderer with no error to read.
    templateFileName() refuses Windows RESERVED DEVICE NAMES (CON, COM1, ...),
    which cannot be filenames even with an extension.
  • Tests: layout.test.ts (46, first run green), template.test.ts (37, first
    run green), studioDelivery.test.ts (44), mcpServer.test.ts (15),
    mcpLive.test.ts (15 — a REAL socket, proving the bind address, the auth
    gate, the 1 MB body limit and the 202-for-notifications behaviour),
    mcpHandlers.test.ts (37), bundle.test.ts (23).
    Suite 529 -> 746, all green; tsc clean; `npm run build` clean.

- ✅ M5 — OFF-THREAD TRACING WITH LIVE LAYERS (2026-08-14). Tracing no longer
  freezes the window.
  • trace.ts gained ONE optional hook, `onLayer(done, total, path)`, fired
    after every colour layer; returning false stops the pipeline and returns
    what it has. That is the only behavioural change to the algorithm, and it
    is what turns a multi-second freeze into progressive layers plus a cancel
    that actually lands (between layers, not at the end of the image).
    DEFAULTS is typed `Required<Omit<TraceOptions,'onLayer'>>` deliberately:
    there is no sensible default callback, and a no-op stub would make
    `opt.onLayer?.()` look optional while always firing.
  • src/design/traceWorker.ts (client) + trace.worker.ts (worker). The worker
    contains NO algorithm — it unpacks a message and calls the SAME traceImage
    the synchronous path calls, which makes "byte-identical to the synchronous
    path" true by construction rather than by testing two implementations
    against each other. Two rules carry the protocol: every message carries a
    JOB ID (so a late result from a cancelled trace is dropped instead of
    overwriting new artwork), and pixels are TRANSFERRED, not cloned (a
    4000x3000 RGBA buffer is 48 MB — cloning it would cost more than some
    traces).
  • designApp: traceRaster() was split out of traceAt() so the worker path
    rasterises EXACTLY as the synchronous preview does — two rasterisers would
    be two pictures and "the preview is what you get" would break at the first
    rounding difference. Falls back to the synchronous path if a Worker cannot
    be created. Vite emits trace.worker as its own 17.9 kB chunk.
  • Tests: traceProgress.test.ts (9), including three that assert a trace WITH
    the hook is byte-identical to one without it (plain, centreline, gradient).

- ✅ M4 — ICON AUTHORING (2026-08-14).
  • src/studio/icon/presets.ts — the published grid rules of Material, Lucide
    and Octicons as DATA. Material's four keyline shapes are the important
    part: an 18x18 square, a 20 circle and two 20x16 rectangles are why a
    circular glyph and a square glyph read as the same SIZE despite the circle
    being geometrically larger.
  • src/studio/icon/validate.ts — the pixel-fit validator, and the feature that
    makes this icon authoring rather than small drawing. THE PARITY RULE: an
    ODD stroke is crisp when its centreline sits on a HALF pixel; an EVEN (or
    zero-width fill) edge is crisp on a WHOLE pixel. Getting that backwards is
    why hand-drawn icons look soft.
    A REAL FINDING, surfaced by the tests rather than assumed: a 24-grid glyph
    is only pixel-perfect at INTEGER multiples of its grid. At 16px the scale
    is 2/3, so a 2pt stroke lands at 1.33px and NO arrangement of nodes fixes
    it. So `ok` is judged only over integerScaleSizes() and the fractional
    sizes are still REPORTED — a red light nobody can ever clear is worse than
    no light. This is also precisely why Octicons draws at 16 and 24 separately
    instead of scaling one to the other.
    snapToPixelGrid() is offered as a FIX, never applied automatically:
    snapping for 16px can nudge a curve drawn to look right at 48, so the user
    picks which size wins.
  • src/studio/icon/export.ts — SVG with a viewBox and NO width/height (a
    `width="24"` in an exported icon is a bug), optional currentColor so the
    glyph inherits text colour, and a hand-written multi-resolution .ico. The
    ICO writer is ours because every generator on npm pulls a native image
    module that will not build on Electron 43 for Windows; the format is a
    6-byte header, 16 bytes per entry and the PNG bytes we already have. THE
    ONE TRAP: a 256px entry records its dimension as 0, because the field is a
    single byte.
  • Tests: icon.test.ts (46). Suite 474 -> 529 across M4+M5, all green; tsc
    clean; `npm run build` clean.

- ✅ M3 — THE COLOUR SYSTEM (2026-08-14). One brand colour in, a whole design
  system out: scales, contrast verdicts, dark mode, colour-blindness preview
  and token export.
  • src/studio/color/oklab.ts — Ottosson's OKLab reference, VENDORED (public
    domain), ~200 lines, zero dependencies. WHY, given culori exists: culori
    converts colours but cannot answer "at THIS lightness and hue, what is the
    most saturated colour sRGB can actually show" — and that question IS the
    picker. computeMaxSaturation() answers it in a fitted polynomial plus one
    Halley step, which is what lets the gamut boundary be drawn per pixel at
    60fps with no solver in the loop.
    BUG FOUND BY TEST: the sRGB spec's two kink thresholds (0.04045 and
    0.0031308) are NOT exact reciprocals — 0.04045/12.92 = 0.003130882, which
    is ABOVE 0.0031308 — so a value in that sliver took the linear branch one
    way and the power branch the other and the round trip was off by ~1e-7.
    LINEAR_KINK is now derived from SRGB_KINK, making them exact inverses.
    clampToGamut reduces CHROMA ONLY: clamping L would break the equal-step
    invariant and rotating h would change which colour it is.
  • src/studio/color/contrast.ts — WCAG 2.x, hand-rolled in ten lines.
    THE APCA TOOLCHAIN IS LEGALLY UNUSABLE HERE and this must not be
    re-litigated: `apca-w3` is All Rights Reserved with patent(s) pending and a
    grant limited to "web content", and it depends on `colorparsley`, which is
    AGPL-3.0. That chain silently taints Adobe Leonardo, apcach, Huetone and
    Harmonizer. WCAG 2.x is the only unencumbered option and the one the law
    cites. Also: verdict() returns AAA/AA/AA Large/Fail — a bare "4.31" means
    nothing to someone laying out a page. solveForContrast() bisects on
    lightness to ANSWER "make this pass 4.5:1", which is the inverse of every
    checker that only tells you that you failed.
  • src/studio/color/scale.ts — THE INVARIANT: a fixed OKLab lightness ladder
    shared by every hue, with only chroma varying per hue. Equal step index
    therefore means equal lightness, which turns contrast from a per-pair check
    into a system property. MEASURED across five hues at step 700 on step 50:
    5.17..6.31, all AA — it cannot hold the RATIO exactly (WCAG luminance
    weights green ~0.72 and blue ~0.07, so it is not OKLab lightness) but it
    holds the VERDICT, which is the property a design system can rely on.
    The seed's HUE is kept and its lightness REPLACED, deliberately: preserving
    the user's exact colour at 500 would inherit whatever lightness accident it
    had and destroy the invariant.
    darkFrom() is not an inversion — the ladder is walked from the other end
    AND chroma is reduced, because the same chroma reads as radioactive on a
    dark surface. Hue is untouched so it stays the same palette.
    CVD simulation from libDaltonLens (public domain). THE RULE: Viénot 1999 is
    one 3x3 matrix and is right for protan/deutan; tritanopia needs Brettel
    1997, which picks a DIFFERENT projection on each side of the neutral axis.
    Everyone who ships one matrix for all three gets tritanopia visibly wrong.
  • src/studio/color/extract.ts — "extract the colours from this image" with
    ZERO new dependencies, because trace.ts already owns a better quantiser
    (variance-cut + deterministic k-means refine + a rescue pass for
    small-but-distinct colours). This adds only what the tracer does not care
    about: NAMING. Dominant/Vibrant/Muted/Dark/Light/Accent, node-vibrant's
    taxonomy reimplemented in ~40 lines against our own OKLCH.
    Fully transparent pixels are DROPPED, not counted as black — a logo on a
    transparent background otherwise reports "mostly black", which is the most
    common wrong answer in image palette extraction.
  • src/studio/color/tokens.ts — DTCG on disk (which is why StudioDoc.tokens is
    already spelled $value/$type: export is a pass-through with no renaming
    layer to drift), CSS custom properties for both themes, and .ase for
    Illustrator/Photoshop — the missing half of the COM bridge we already have.
  • src/studio/colorPanel.ts — the dock. The picker is HAND-ROLLED because the
    only framework-free picker with real RTL support documents a single-instance
    limitation, and a shape inspector needs a fill picker and a stroke picker
    side by side. None of them draw the gamut boundary either, which is the
    whole reason to pick in OKLCH. Out-of-gamut area is left TRANSPARENT over a
    checker, so an impossible colour is visibly not there to click rather than
    silently clamped on release.
  • ipc/preload/types: saveFileAs gained a 'data' kind. Without it the dialog
    fell through to the xlsx filter and offered a token file as a spreadsheet.
  • Tests: oklab.test.ts (37), colorSystem.test.ts (49). Suite 388 -> 474, all
    green; tsc clean; `npm run build` clean.

- ✅ M2 — PATH KERNEL, NODE EDITOR, REGION RELEASE & STROKE OUTLINE
  (2026-08-14). Closes the longest-standing design-page gap: "traced paths
  cannot be re-coloured or node-edited, they can only be moved and deleted".
  • src/design/path.ts — THE CHOKE POINT. Paths reach us from four unrelated
    directions (tracer, Illustrator bridge, pasted SVG, and later the web
    picker), each speaking a different dialect: relative commands, shorthand
    S/T, arcs, implicit repeats. normalize() funnels all of it to ABSOLUTE
    M/L/C/Z only, at 3 decimals. That single assumption is what makes a node
    editor tractable. Arcs specifically CANNOT survive a non-uniform scale —
    scaling an A command's two radii independently is not expressible in the
    arc grammar — so unarc() is a correctness requirement, not tidiness.
    Also: parse (folds H/V/Q/T/relative, exact quadratic->cubic elevation, and
    does not lose its place on an unexpected arc), segsToD (never emits -0,
    which would break byte-identical round-trips), shiftPathD (pure addition,
    so nothing is re-rounded twice), splitSubPaths/joinSubPaths, nodesOf,
    moveNode/moveControl/deleteNode/insertNodeAfter/toCurve/toLine, pathBBox
    (convex-hull bound — anchors alone over-report a bulge and under-report an
    overshoot, and the bbox is what the resize grips measure), subPathArea,
    subPathContains, flatten.
    moveNode drags the ADJACENT control points with the anchor — without that
    the handles stay behind and the segment folds inside out, which is the
    single most common bug in hand-written node editors.
  • src/design/compound.ts — RELEASE REGIONS, the recolour prerequisite.
    trace.ts emits one Shape per colour, each carrying every region of that
    colour in one `d`, so a traced logo arrives as a few opaque blobs with no
    handle for "recolour just this petal". THE OBVIOUS FIX IS WRONG: splitting
    every subpath turns a donut into a solid disc, because the inner ring stops
    being a hole. groupRegions() nests by containment with ties broken by AREA
    (a ring inside two others belongs to the SMALLER one) and decides hole-ness
    by DEPTH PARITY, so a ring inside a hole is solid again. releaseCompound()
    then emits one ordinary path Shape per region — no model change at all.
    A gradient is DROPPED rather than carried onto a rebased child, because it
    lives in the parent's local space and would silently shift its ramp.
  • src/design/outline.ts — STROKE -> FILLED OUTLINE via bezier-js
    reduce()/offset(). Needed by icon export (M4) and by centreline traces.
    NOT rasterise-and-retrace: both popular libraries for this rasterise the
    stroke, and a 1.5pt stroke rasterised at 16px comes back as garbage (one of
    them also exact-pins a native image module that will not build on
    Electron 43).
    TWO BUGS THE TESTS CAUGHT: (1) the round cap was derived by rotating the
    chord's radius, which picks a side arbitrarily — half the time the cap
    curved BACK INTO the stroke (measurable: the outline was not longer than
    the source). Caps now take the curve's own travel direction. (2) reduce()
    alone is enough for a thin stroke and NOT for a wide one, because offset
    error grows with distance — a 12pt stroke measured 0.093pt off against a
    0.05pt budget. refineForOffset() now splits each simple piece until its
    offset ACTUALLY measures right, using the same criterion the test asserts.
  • src/design/nodeEdit.ts — the DOM half, shaped like handles.ts so the two
    overlays feel the same. Control handles are shown ONLY for the selected
    anchor and its neighbour: every handle on a 400-node traced logo is
    unreadable and makes the anchors impossible to hit. A curve anchor draws
    round and a corner square, so the grip's shape says what the segment is
    before you touch it. A click that never moved is a SELECTION, not an edit —
    committing it would push an identical state onto the undo stack per click.
    In node-edit mode Delete removes the NODE, not the whole shape.
  • designApp: toolbar «نقاط» / «فصل» / «تفريغ»; node editing suppresses the
    resize frame (they compete for the same pixels) and ends on any selection
    change; applyNodeEdit rebases the shape origin when an edit pushes geometry
    outside the old box, or the frame and hit test drift off the artwork.
  • src/bezier-js.d.ts — bezier-js 6.1.4 ships no types and @types/bezier-js is
    still on the v4 API, so installing it would type a DIFFERENT library than
    the one we call. Declares only the surface outline.ts actually uses.
  • Tests: path.test.ts (42), compound.test.ts (19), outline.test.ts (18),
    pathKernel.test.ts (13 — runs the REAL traceImage/ringToPath output through
    the kernel, not hand-written samples). Suite 296 -> 388, all green; tsc
    clean; `npm run build` clean.

- ✅ M1 — HANDLES, TRANSFORM & THE v4 DOCUMENT (2026-08-14). The first
  milestone of EXELMJ Studio: every object on the canvas can now be resized,
  rotated and cropped directly, and the document format is ready for the tools
  that follow.
  • src/design/transform.ts — PURE geometry (no canvas, no DOM, node-testable
    like shapes.ts): rotatePoint / toLocal / handlePoint / hitHandle /
    resizeRotated / angleFromCenter / rotatedAABB / snap1D / snapBox /
    transformPathD / applyBoxToShape. THE load-bearing piece is resizeRotated:
    a rotated resize is done in the box's LOCAL frame (pointer rotated back by
    -rotation about the centre), then the new centre is placed so the OPPOSITE
    corner lands exactly where it already was. Doing it in page space is the
    familiar "the shape swims away from the cursor" bug. 48 generated cases
    (8 grips x 6 angles) assert the anchor does not move.
  • THREE REAL BUGS the tests caught before any UI existed:
    1. `Math.abs(w)` when clamping a resize RESURRECTED the flip it was meant
       to prevent — dragging SE past NW returned a 100pt box instead of the
       1pt floor. Clamp the SIGNED value.
    2. fromCenter (Alt) still offset the centre by half the new width, so
       Alt-resize drifted instead of growing symmetrically.
    3. transformPathD did not call .unarc(), so an `A` command survived a
       NON-UNIFORM scale — which the arc grammar cannot express. Every path now
       goes through .unarc().unshort().abs().round(3); this is also the
       normalisation choke point M2 builds the node editor on.
  • src/design/handles.ts — the DOM half: ONE overlay serving both shapes and
    images (8 resize grips + rotate grip + 4 crop grips + smart guides).
    Before this, images had a single corner grip with its own drag code and
    shapes had no grips at all — two behaviours for one gesture, neither able
    to rotate. installImageResize() and .dz-img-grip are DELETED.
    - cursorFor() rotates the cursor set with the object; an unrotated cursor
      is actively misleading past 45 degrees.
    - snapResizedEdge() is deliberately NOT snapBox(): a resize must leave the
      anchored edge exactly where it is, so only the edges the grip actually
      moves may snap. Snapping the centre or the far edge visibly drags the
      anchor.
    - Rotation snaps to 15 degrees under Shift; snapping is suppressed for a
      rotated box (no edge is parallel to the guide, so it would move the
      object without ever aligning anything) and under Ctrl.
    - Every frame recomputes from the gesture's START state, never from the
      previous frame, so a drag cannot accumulate drift.
  • DOCUMENT v4, additive and DERIVED: Shape gains rotation?/opacity?/radius?,
    PlacedImage gains rotation?/opacity?. The version is COMPUTED from whether
    any v4 field is actually present (usesV4Features), so a document that never
    rotates anything still writes `"version": 3` byte-for-byte and stays
    readable by v0.3.0. stripDefaultV4()/stripDefaultImageV4() delete
    default-valued keys on the way out — WITHOUT them a `rotation: 0` left by
    the editor silently pushed a plain file to v4 (caught by three tests).
    Deleting keys rather than rebuilding the object also preserves key order,
    which is what makes the round-trip byte-identical.
  • src/studio/model.ts — the v4 side-table: Frame / TokenSet (DTCG-shaped
    $value/$type so export is a rename-free pass-through) / ComponentDef /
    ComponentInstance / IconMeta / CaptureRecord / PageKind, with a full
    untrusted-input cleaner. HIERARCHY IS A SIDE-TABLE, NOT A TREE: frames
    reference leaf ids and the flat per-page arrays are untouched, because
    every renderer, hit-test, exporter and the undo snapshot iterate those
    arrays. Code that knows nothing about frames still draws a correct picture.
  • Undo/redo and the sidecar now carry `studio`; an empty doc serialises as
    absent so nothing changes for a document that never opened Studio.
  • Crop is a MODE (toolbar toggle), not a gesture — the four edge grips would
    otherwise fight the resize grips for the same pixels. The crop MODEL,
    painter and PDF path already existed (images.ts cropRectPx/paintImage);
    only the UI was missing, which is why this was a day and not a week.
  • Tests: tests/transform.test.ts (88), tests/handles.test.ts (11),
    tests/designV4.test.ts (24 incl. the byte-identical v3 round-trip and the
    "emits no v4 keys at all" guard). Suite 172 -> 296, all green; tsc clean;
    `npm run build` clean.
  • CONTRACT CHANGE: parseProject('{"version":4,...}') now SUCCEEDS. The old
    test asserting it returned null was written when 4 meant "from the future,
    refuse"; it now asserts 4 parses and 5 is still refused.

- ⏳ Tracing runs on the RENDERER thread: a 2000px 8-colour trace freezes the
  window for a few seconds. Moving it to a Worker would keep the UI alive and
  allow a progress bar.
- ✅ (M2) Traced paths can now be node-edited (per-anchor grips + Bezier
  handles), released into separately colourable regions, and stroke-outlined.
- ✅ (M1) Image CROP now has a UI: the toolbar «قصّ» toggle plus four edge
  grips on the shared overlay. The model/painter/PDF path were already done.
- ✅ (M1) Shapes and images both RESIZE and ROTATE via the shared overlay.
- ⏳ Illustrator bridge round-trip never exercised against a RUNNING
  Illustrator. The «الستريتر» button renders and is wired; whether the COM call
  returns Arabic runs correctly on this machine is still unproven. Adobe
  Illustrator 2026 IS installed — open a .ai, press the button, confirm the
  status line reports «الستريتر سلّم نصوص الملف (n)» and that the seeded
  boxes carry the true fill colors.
- ⏳ AI→Word RTL follows box ALIGNMENT, not text content: a box seeded from an
  LTR run and retyped in Arabic gets no `<w:rtl/>`/`<w:bidi/>` in the .docx
  (positioning keys off `align`, so flipping it naively would misplace the
  frame — the run's direction needs separating from the frame's layout
  direction). Arabic glyphs still shape correctly in Word; mixed digits and
  punctuation inside such a line may order wrongly. Left as-is deliberately.

- ✅ UNDO/REDO + MULTI-WINDOW + colour-complete trace (2026-08-13, night;
  manager's three requests + the Illustrator Image-Trace panel screenshots as
  reference).
  • UNDO/REDO in design mode: history is captured at the setDirty(true) choke
    point (every mutation in designApp ends there) — one serialized snapshot
    {boxes, shapes, images} per user action, 40 deep, redo cleared on new
    edits, baseline refreshed on open/save (history survives a save). Toolbar
    buttons + Edit-menu routing + Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z.
    TWO real bugs found by live-testing the keys:
    1. Univer's shortcut service (registered at boot, listening first)
       swallows Ctrl+Z and Delete even while its grid is HIDDEN — and it
       ignores synthetic events (isTrusted=false), which is why a scripted
       probe worked while the physical key did nothing. Fix: the design-keys
       hook is registered in boot() BEFORE Univer exists (capture order =
       registration order); designApp publishes its handler into
       window.__exelmjDesignKeys.
    2. THE MANAGER'S KEYBOARD IS ARABIC: the physical Z key delivers
       e.key='ئ', so matching on the letter never fired. Shortcuts now match
       e.code ('KeyZ'/'KeyY') — layout-independent. Remember this for EVERY
       future shortcut in this app.
  • MULTI-WINDOW: File menu «نافذة جديدة» (Ctrl+Shift+N). electron/main.ts
    keeps a Set of windows; `win` tracks the FOCUSED one (menu actions and
    dialogs follow focus); dirty is per-webContents (Map) so each window gets
    its own close guard; closingForced is a WeakSet; language switch reloads
    all windows and its guard checks anyDirty(). ipc doc:set-dirty now carries
    e.sender.id. Verified live: two windows, independent documents.
  • TRACE COLOUR COMPLETENESS ("يهمل الكثير من الألوان"): three layers of fix —
    colors:'auto' (default; variance-cut keeps splitting while a cluster's
    per-pixel SSE > 360, up to 24) + refinePalette (deterministic k-means
    seeded from the cut, so palette entries land on the EXACT artwork
    colours) + a RESCUE PASS over the FULL image (palette is built from a
    sample, so a small-but-distinct colour — a thin rule, one gold seal —
    could be missed entirely: pixels still >44 RGB units from every palette
    entry get their own entries, filtered against near-duplicates, up to 32).
    Tests: 3-colour image → exactly 3 layers on auto; refine converges to
    exact centres; a 0.6% gold seal survives colors:2 (fails without rescue).
    Panel gained a «تلقائي» checkbox (default on).

- ✅ TRACE v3: STACKED LAYERS + raster sources + pinch zoom + blank pages
  (2026-08-13, late session; manager: "الترييس للصورة الملونة سيء جدا…
  اريد مطابقة 100%").
  • ROOT CAUSE of the colour-trace halos: every colour was traced as an
    independent abutting region, so one shared edge got TWO separately fitted
    curves that diverge by fractions of a pixel — the page showed through as a
    bright hairline. An offsetLoop outset (mitred; kept, default 0) only
    papered over it.
  • THE FIX is structural — STACKED LAYERS, the Inkscape "stack scans" idea on
    top of our sub-pixel field: kept colours are ordered biggest-first and
    layer i's region is "this colour plus every colour painted above it"
    (membershipFieldSets in/out colour sets). Lower layers extend UNDERNEATH
    upper ones, every boundary is traced exactly once, seams are impossible by
    construction. Paint order = array order; the old area sort was REMOVED
    (it would scramble the stack). Dropped colours (background / eyedropper)
    are outside every layer, so their pixels are simply never painted.
  • MEASURED, same 300×190@3x ornament crop of the manager's coloured card:
    near-white halo pixels original=0, old trace=24,301, stacked trace=0.
  • Tests pin the contract: bottom layer spans the whole image while the top
    layer spans only its own half; byte-identical determinism across two runs;
    a dropped colour is painted by NO layer (and layers do not stretch under
    it); offsetLoop grows outward with a mitre and shrinks holes.
  • Same pass, the manager's four reported bugs, all verified live:
    1. OPEN accepts static images (png/jpg/webp/bmp/gif/avif) — ipc filters +
       DESIGN_EXT_RE + designApp kind 'raster': the picture becomes the page
       (1px=1pt) drawn onto bgCanvas, so sampling/patches/exports work
       unchanged; auto-fits the window on open (a 4500px photo opened at 13%).
    2. PINCH ZOOM: Chromium delivers trackpad pinch as wheel+ctrlKey, and
       Ctrl+wheel is the mouse equivalent — one handler, exp(-deltaY/320),
       range widened 0.1–8x. Verified via dispatched WheelEvent 13%→28%.
    3. NEW BLANK PAGE: «جديد» button → newBlank() A4 white raster page.
    4. Colour trace quality: see above. ALSO: trace now works on the PAGE
       itself when a picture was opened as artwork (traceSelectedImage falls
       back to the raster page, blanks it after, vectors replace it).
  • Caveat discovered while testing: the INSTALLED EXELMJ (12:55 build) held
    the single-instance lock, so dev launches silently exited — the manager
    had been clicking an 8-hour-old app. Kill EXELMJ.exe before dev runs.

- ✅ IMAGE TRACE (raster → vector) — MILESTONE 3 (2026-08-13). The manager's
  «خاصية trace»: our own implementation, no third-party tracer.
  src/design/trace.ts — the whole pipeline, pure and unit-tested in node:
  1. buildPalette: VARIANCE-CUT quantisation. Classic median cut splits at the
     MEDIAN, so a dark logo on a big white page (49 px vs 351) puts ink and
     paper in the same box and the trace comes out grey — that exact case is a
     test. The cut point is chosen where the two halves' variance is lowest
     instead, while the CHANNEL is still chosen by widest spread (picking the
     channel by lowest error instead selects the least informative one: a
     near-constant green channel splits perfectly while mixing red with blue —
     also a test).
  2. SUB-PIXEL CONTOURS (src/design/isoContour.ts), after the manager rejected
     the first result outright ("اريده ادق من دون خلل نهائيا"):
     • denoiseMedian — a 3x3 median pre-pass. JPEG speckle used to claim its
       own palette slot and pepper the trace with specks; a median kills it
       WITHOUT moving edges (a blur would). On the ALBABA logo this alone took
       the output from 5-6 ragged paths to 1 clean one.
     • membershipField — soft membership in [0,1] per colour, exactly 0.5 where
       a pixel sits half-way between this colour and its nearest rival.
     • isoContours — marching squares on that field with linear interpolation,
       so the outline passes THROUGH the middle of an anti-aliased edge instead
       of snapping to a pixel boundary. Crossings are keyed by integer grid-edge
       id, so segments chain exactly with no float comparison; the two saddle
       cases are resolved by the cell centre (guessing there produces stray
       hairlines). Holes still come back wound opposite for evenodd.
     • sharpenCorners (curveFit.ts) — grid sampling ALWAYS chamfers a right
       angle (a hard-edged square traces at area 3.5 instead of 4, an eighth of
       a pixel lost per corner). Extending the two straight edges that meet
       there and taking their intersection puts the corner back exactly; a
       genuinely round shape is untouched because findCorners never flags it.
       Tested both ways — the square test fails by 0.2px if it is removed.
  3. src/design/curveFit.ts — least-squares cubic Bézier fitting (Schneider,
     Graphics Gems) with Newton reparameterisation, plus findCorners over a
     WINDOW so a 1-px staircase is not mistaken for a corner.
     THIS IS THE QUALITY FIX. The first version routed quadratics through edge
     midpoints; every pixel step became a bump and straight letter strokes came
     out wavy — the manager rejected it ("الجودة سيئة جدا"). Fitting averages
     the staircase away and still stops dead at real corners because the ring
     is split there first. RDP is now applied ONLY when smoothing is off: it
     would delete the very samples the fit averages over.
     Precision is measured, not asserted by eye — the tests sample the emitted
     curves and check a traced circle stays within 1.2 px of its true radius, a
     45° edge stays within 1.6 px of y=x, and a rectangle's sides stay flat.
  • Traced output becomes REAL EDITABLE SHAPES: shapes.ts gained a 'path' kind
    holding SVG data in LOCAL pt (so moving never rewrites geometry), rendered
    in the SVG layer, painted to PNG via Path2D, and written to PDF with
    drawSvgPath — verified: no image XObject is emitted. Path data is
    sanitised to geometry characters only before it reaches an SVG attribute
    or a PDF stream.
  • The «تتبّع» panel (our layout, the controls Illustrator's Image Trace
    exposes): colours, detail, corner smoothing, and background handling —
    'auto' drops the dominant colour only when it is near-white (luma > 0.92),
    which is the logo-on-paper case and leaves real artwork intact. A COLOURED
    background is removed by picking it with the EYEDROPPER (dropColors +
    tolerance), which 'auto' cannot do.
  • Working raster capped at 2000 px: the fitter averages the staircase, so a
    finer staircase means a truer edge. Accuracy over speed, as asked — the
    membership field costs O(pixels x palette) per colour, so an 8-colour trace
    at 2000px takes a few seconds and blocks the renderer thread while it runs.
  • The old pixel-lattice tracer (maskContours) was DELETED once isoContours
    replaced it — its invariants (holes, diagonally touching blobs) moved to
    tests that drive the new engine, so nothing is merely orphaned.
  • scalePathData now resets its x/y parity on ANY command letter — the old
    class listed only M/L/Q/Z, so a 'C' would have silently swapped every
    following coordinate pair.

- ✅ IMAGES / LOGOS — MILESTONE 2 (2026-08-13). src/design/images.ts:
  PlacedImage (pt from the page top-left, pixels inlined as a data URL so the
  placement survives a re-open without the source file). Pure, unit-tested
  helpers: fitIntoPage (a fresh logo lands at half the page's short side,
  ratio kept), cropRectPx (crop fractions → source pixels), cleanImage (the
  sidecar sanitiser: ONLY `data:image/png|jpeg;base64,…` is accepted — those
  are exactly what pdf-lib can embed, so anything stored is guaranteed to
  survive the PDF export; zero-size and self-erasing crops are dropped).
  • Sidecar v3 gained `images` per artboard next to `shapes`.
  • designApp: the palette's image tool opens an <input type=file> picker
    (window.exelmj.openFile filters to documents, so images need their own),
    places the logo centred, and gives it a corner grip — drag to resize,
    Shift keeps the ratio. Images render in .dz-imglayer BETWEEN the shapes
    and the text boxes, are listed in the layers panel with a thumbnail, and
    Delete removes the selected one.
  • Exports: PNG and the AI→Word background raster paint them via
    paintImage(); the PDF embeds them (embedPng/embedJpg) — verified live on
    the invoice: the produced PDF carries one image XObject with DCTDecode.
    A CROPPED image is re-encoded to exactly its visible region first
    (imagesForExport), because pdf-lib can embed but cannot crop.
  • BUG FOUND AND FIXED IN THE SAME PASS: the resize grip overhangs the frame
    by 5px, but the frame carried `overflow: hidden` (needed for the crop), so
    the grip was CLIPPED and invisible. The clip moved to an inner
    .dz-img-clip; the grip is also anchored PHYSICALLY bottom-right (a resize
    handle is a spatial affordance — `inset-inline-end` put it bottom-LEFT in
    the Arabic UI).

- ✅ DESIGN TOOL PALETTE — MILESTONE 1 (2026-08-13, manager: "اريد شريط ادوات
  على الجانب الايمن فيه ادوات مثل تطبيق الستريتور… ادوات تصميم اخرى تغنيني عن
  الالستريتور", scoped with him to: تحديد/تحريك، أشكال، صور، قطارة، وتحويل
  الصور إلى SVG; goal = "تعديل + إنشاء تصاميم بسيطة").
  LEGAL STANCE (he agreed, and it matches the Word-ribbon precedent): copy the
  BEHAVIOUR, never Adobe's assets. Icons in this palette are our own inline
  SVG. Illustrator is closed-source, so there is no code to mirror — parity
  means the interactions (drag from the press point, Shift constrains, Esc
  cancels the tool, click-away deselects).
  • src/design/shapes.ts — Shape model (rect/ellipse/line/arrow), all geometry
    PURE so it unit-tests in node: shapeBBox (handles drags in any direction
    via signed w/h), arrowHead (head at the shaft END, size capped at a third
    of the shaft), shapeHit (a line hit-tests along its SEGMENT, not its bbox),
    cleanShape (sidecar sanitiser: unknown kind / zero area / no fill AND no
    stroke are all dropped, colors hex-only), paintShape (canvas).
  • Sidecar schema v3: `shapes` per artboard alongside `pages`. v1 and v2 files
    still load and simply carry no shapes. Shapes survive artboard switches.
  • designApp: #exelmj-design-tools on the RIGHT edge (RTL) — select, rect,
    ellipse, line, arrow, eyedropper + fill/stroke swatches. Shapes render in
    their own <svg class="dz-shapelayer"> UNDER the text boxes so text stays
    clickable over a fill. Select/move by dragging, Delete removes, Esc returns
    to the select tool, and every shape is listed in the layers panel.
  • The eyedropper samples the artwork canvas and applies the exact color to
    the swatch AND the current selection — verified live by picking the
    invoice banner's purple and watching the ellipse adopt it.
  • Exports: PNG and the AI→Word background raster paint shapes via
    paintShape(); the PDF export writes them as REAL VECTORS (drawRectangle /
    drawEllipse / drawLine + an SVG path for the arrow head) — verified by
    decoding the produced content stream: bezier `c` ops present, NO image
    XObject appended.
  • BUG FOUND AND FIXED IN THE SAME PASS: pdf-lib's drawSvgPath, with these
    options, emits the path numbers UNCHANGED — it does NOT flip y as assumed.
    The arrow head landed a full page-height off (y≈384 while the shaft tip was
    at 457.9). Now the y flip is done explicitly. Regression test decodes the
    content stream and asserts the head points cluster at the shaft tip; it
    fails if the flip is removed.

- ✅ REAL-INVOICE PASS (2026-08-13, manager: "جرب هذا الملف بالتعديل" —
  E:\هايبر البركة\فاتورة_معدلة.ai, an A4 Arabic invoice: gradient banner,
  gradient-filled table headers, 30 text runs). The cover patch is invisible
  over the banner gradient too. FOUR more defects found and fixed:
  1. TEXT WAS NOT REAL ARABIC. pdf.js returns whatever the PDF encoded, which
     for Arabic is PRESENTATION FORMS (U+FE70–U+FEFF: ﻞ ﻴ ﺼ …), not letters.
     They look right on screen but Word cannot join or search them, and
     retyping part of a run mixes the two shapes. `normalizeArabicText`
     (bidiRuns.ts, NFKC, applied in aiBackground.extractText) maps every form
     back to its base letter and splits the lam-alef ligature. Verified live:
     the seeded box now reads 0627 0644 062A… instead of 0627 FEDF FE98…
     It lives in bidiRuns.ts, NOT aiBackground.ts, because importing the
     latter in vitest pulls pdfjs → `DOMMatrix is not defined`.
  2. BOLD WAS LOST on every edited heading. `getTextContent()` only reports
     `fontFamily: "sans-serif"` (probed directly) — the REAL name lives on the
     loaded font object, `page.commonObjs.get(item.fontName).name`
     ("ABCDEF+Cairo-Bold"). `pdfFontName()` reads it, guarded by `has()` +
     try/catch so an unrendered page just yields undefined. seedBoxFromItem
     sets `box.bold` from the name, and adopts the family ONLY when it matches
     FONT_CHOICES (an uninstalled subset name would render worse than Arial).
  3. CLICKING AN ALREADY-REPLACED RUN CREATED A DUPLICATE (manager reported it:
     "النقر على مكان النص السابق يقوم بتوليد نص جديد"). Hotspots are drawn for
     every run regardless of state, so each click pushed another box onto the
     same spot. `boxCoveringRun()` (overlayModel.ts, pure + unit-tested) now
     makes seedBoxFromItem SELECT the existing box and focus it instead. The
     same helper replaced wordExport's private copy of that containment test.
  4. My own cleanup broke settings.json: PowerShell `Out-File -Encoding utf8`
     writes a BOM, the app's JSON.parse failed and reset language ar→en and
     emptied recentFiles. Restored. NEVER write JSON the app reads with
     PowerShell Out-File/Set-Content — use node or the editor tools.
  STILL IMPERFECT (cosmetic, not fixed): a replacement whose width differs from
  the original is anchored at the original run's edge, so it is not re-centred
  inside a centred pill.

- ✅ BUILT & VERIFIED (2026-08-13, session 2) — the gradient cover patches and
  the Illustrator bridge are now compiled, tested and run live. Results:
  `npx tsc --noEmit` clean; `npx vitest run` 92/92; `npm run build` 12.6s, no
  OOM. Live run on a purpose-built GRADIENT fixture (600×400 pt .ai, vertical
  blue→orange blend, text on top): «تعديل نص الملف» detected both runs,
  clicking one seeded a box with the right size (34pt) and WHITE sampled ink,
  retyping in Arabic replaced the original seamlessly. The patch is invisible
  NUMERICALLY, not just visually: in the exported PNG the max vertical step
  through the patch band is 2 (the gradient's own step) and the max horizontal
  step is 0 — identical to an untouched control row. PDF + PNG + Word exports
  all carry the patch. The «الستريتر» button is present in the toolbar (its
  round-trip against a live Illustrator is still unexercised — see PENDING).

  THREE DEFECTS FOUND AND FIXED while verifying:
  1. `overlayModel.serializeProject` dropped any box with empty text, so a box
     that only ERASES original text (cover patch, no replacement) was lost on
     save/reload. Every consumer already paints covers independently of text
     (`if (!box.cover) continue`), so the filter is now
     `b.text.trim().length || b.cover`. Caught by the pre-existing cover test.
  2. `wordExport.buildDesignWord` emitted a frame for EVERY detected run,
     including runs the user had replaced — the .docx carried the ORIGINAL text
     stacked on the replacement at the same framePr x/y (verified: both at
     x=1160 y=2940). Runs whose centre falls inside a user cover patch are now
     skipped. Regression test added (fails without the fix).
  3. `#exelmj-rtl-fx` (the sheet's RTL formula-bar overlay, `position: fixed`,
     z-index 1000, white) kept painting a white band across the top of DESIGN
     and WORD mode — a pre-existing cosmetic bug the manager reported
     independently. `syncFxOverlay` now also requires `sheetVisible()` (the
     `#app` host is display:none outside sheet mode), and `refreshRtlOverlay()`
     is called from all three mode hooks in main.ts so the switch re-evaluates
     it (nothing else re-ran the sync on a mode change).

- ✅ LAYERS PANEL (الطبقات) in design mode (2026-08-13, manager: "يجب ان
  يتواجد فيها شريط layers يمكنني من تحديد العناصر وحذفها وتعديلها
  واختيارها"). `designApp.renderLayers()` + `#exelmj-design-layers` (232px
  aside; stage and panel now share `#exelmj-design-main`, a flex row). Two
  sections: «عناصري» lists the user's boxes topmost-first (later boxes paint
  over earlier ones) with an ink swatch, a text preview, ✎ (select + focus the
  editable) and ✕ (delete); «نصوص التصميم الأصلية» appears once the file's
  text has been scanned and clicking a row calls the SAME `seedBoxFromItem`
  the page hotspots use — so the artwork's own text can be picked from the
  list instead of hunting for it on the page. Selection is two-way (panel row
  ↔ canvas box). Refreshed from `renderBoxes()`, `select()` and
  `showTextHotspots()`. Verified live: seeding from the list, two-way
  selection, and delete (which removes the cover patch and brings the original
  text back) all work.
  NOTE (not a bug, a limitation): the panel lists what EXELMJ controls — user
  boxes and detected text runs. It cannot list the .ai's real Illustrator
  layers/objects: that structure lives in the private AIPrivateData stream.

- ✅ EDIT-FILE-TEXT TOOL + AI→WORD CONVERTER (2026-08-13, same day, manager's
  follow-up: "لا أستطيع تعديل الكتابة… اخترع أداة" + "أحتاج أحول ملفات
  الستريتور لملفات وورد").
  • WHY the original can't be edited natively: .ai keeps its editable state in
    Adobe's PRIVATE AIPrivateData stream (undocumented, version-specific — no
    third party reads it, and no open-source writer has existed in 25 years);
    every other app only gets the embedded PDF view. Told the manager plainly.
  • THE TOOL (design mode, «تعديل نص الملف», ICONS.color): pdf.js
    getTextContent → aiBackground.extractText(page) returns every run in
    top-left pt coords (transform[5]→baselineTop, [3]→size, .width, .dir from
    pdf.js bidi) with same-line same-dir near-touching runs merged (RTL joins
    later-x first). Toggling the tool overlays dashed HOTSPOTS on each run;
    clicking one seeds an overlay TextBox at the exact spot (y = baselineTop −
    1.02·size matches both the on-screen first baseline and the PDF export
    math) pre-filled with the run's text, its size, its sampled ink color, and
    a `cover` patch: rect over the original filled with the MEDIAN color
    sampled just OUTSIDE the run (sampleBackground walks the bbox border on
    the render canvas). Ink = pixel INSIDE most DISTANT from the bg color
    (darkest-pixel picked the banner for white-on-blue headings). Patches
    render in the box layer, in PNG export, and as pdf-lib drawRectangle
    before the text in PDF export. Verified live: clicking «مجموعة الحر»
    (white on blue) seeded white ink + banner-blue patch; retyped text
    replaces the original seamlessly. cover is sanitized in parseProject
    (hex-only bg, positive w/h).
  • AI→WORD (src/design/wordExport.ts, toolbar «وورد», saveFileAs kind docx):
    render page at 2×, WIPE every detected run with its sampled-bg patch (+
    user cover patches), embed the cleaned raster as a behind-document
    floating image, and emit ONE absolutely-positioned Word paragraph frame
    (w:framePr, twips = pt×20, anchored to page, zero-margin exact-size
    section) per run and per overlay-box line — size/color/rtl preserved
    (bidirectional + w:rtl + sizeComplexScript). The client opens the .docx in
    Word: design as background, EVERY line editable in place. Unit-tested
    (framePr/behindDoc/bidi present; our own docxImport reads the texts back).
    SVG files → message to edit directly (their text is truly editable).
  • GRADIENT PATCHES (2026-08-13, manager: "عند محاولة البناء فوق صورة متعددة
    الالوان سيظهر لون مختلف يشوه الصورة"): src/design/inpaint.ts REBUILDS the
    background instead of flat-filling it. reconstructBackground() reads four
    1px strips 2px OUTSIDE the rect and MEDIAN-smooths each (window 7) so a
    neighbouring line of text clipped by the strip cannot streak the result,
    while a real color boundary survives (median = edge-preserving); if the
    ring's spread ≤ 12 the area is solid and the flat bg stays (tiny sidecar,
    exact color), otherwise coonsSurface() gives each interior pixel =
    horizontal interpolation (left↔right strip) + vertical interpolation
    (top↔bottom strip) − the bilinear corner term (corners = midpoint of the
    two strips meeting there). That reproduces a linear gradient in ANY
    direction EXACTLY (unit-tested) and stays smooth on two-tone blends.
    coonsSurface/medianSmooth are pure (no canvas) precisely so they are
    unit-testable in node. Capped at 1400px, stored as a PNG data URL in
    cover.img (sanitized to /^data:image\/png;base64,/ in parseProject).
    Consumed by: the on-screen .dz-patch (background-image, 100% 100%),
    exportPng/AI→Word via paintCover(), pdf-lib via embedPng+drawImage, and
    the converter's run wipes via wipeRect() straight on the export canvas.
    Same commit fixed the AI→Word wipes using pxPerPt while render() sizes the
    canvas by devicePixelRatio too — they now use canvas.width/widthPt.
    It cannot recover what sat UNDER the glyphs (that data is not in the
    file); it rebuilds the surroundings, which is what makes it invisible.
  • LIMITS: text saved as outlines/curves or rasterized inside the .ai has no
    text runs to detect (status shows «لا توجد نصوص قابلة للالتقاط»); a patch
    laid over a photo/logo (not a gradient) still reads as a smooth blur; the
    detected font maps to Arial (PDF font names are subset-mangled).

- ✅ WORD RIBBON UI (2026-08-13, follow-up to Word mode) — the manager asked to
  "copy an open-source Word-like interface, correctly". Multi-agent survey
  verdict (Umo=MIT/Vue-only, SuperDoc=AGPL/own-engine, ONLYOFFICE=AGPL/needs
  Document Server, its ribbon = best structural REFERENCE): re-implement the
  ribbon PATTERN in-house on our tested TipTap engine — layout patterns are
  functional methods (Lotus v. Borland), icons are Microsoft's Fluent UI
  System Icons (MIT, @fluentui/svg-icons; 35 inlined in src/word/icons.ts with
  attribution; RTL variants used for lists/indent/direction). Legal even if
  the app is ever distributed; no Office assets or trademarks.
  src/word/ribbon.ts: tab row (ملف accent tab + الرئيسية/إدراج + quick
  save/undo/redo), grouped body with bottom captions (خط/فقرة/أنماط //
  جدول/وسائط), Word-blue #185ABD states, style-card gallery, line-spacing
  dropdown (TextStyleKit LineHeight), color split-buttons with swatch bars,
  the signature TABLE HOVER-GRID picker (10×8, RTL anchor top-RIGHT, live
  «جدول ٤×٣» caption — verified live), File dropdown panel, status-bar zoom
  (CSS scale on the page, 50-200%). wordApp.buildToolbar now just wires a
  RibbonActions object; #exelmj-word-toolbar container styling moved into the
  ribbon (they are the same element — the old flex/padding fought it).
  All toolbars reserve padding-inline-start 272px for the 3-way pill.

- ✅ DESIGN MODE (التصاميم) DONE (2026-08-13) — manager: "أداة تعدل ملفات Ai
  والـSVG… أكتب عليه بشكل طبيعي ويظهر بالخلفية وأعدل الكتابة لاحقاً".
  • FACTS the build rests on (multi-agent research, all verified):
    modern .ai IS a PDF container (detect %PDF- in first 1024 bytes; the
    saved-without-PDF-content placeholder is detected via its known text and
    explained in Arabic); pdfjs-dist 6.2.108 renders it (worker inlined via
    ?worker&inline → blob worker, works over file://; assets copied to
    src/public/pdfjs/{cmaps,standard_fonts,wasm,iccs}); pdf-lib 1.17.1 +
    @pdf-lib/fontkit 1.1.1 PROVEN ON THIS MACHINE (content-stream level) to
    shape Arabic and reverse pure-RTL lines — pass LOGICAL order text, and
    pre-reverse ONLY embedded LTR runs (digits/Latin) or numbers mirror:
    src/design/bidiRuns.toPdfVisual (unit-tested with the manager's phone
    number). pdfjs v6 API: render({canvas,...}) not canvasContext; destroy on
    the loadingTask, not the doc.
  • src/design/: aiBackground.ts (sniff+render+noPdfContent), overlayModel.ts
    (TextBox in pt from top-left; sidecar <file>.exelmj.json via silent IPC —
    the original artwork is NEVER modified, boxes stay editable forever),
    designApp.ts (toolbar فتح/حفظ/PDF/PNG/إضافة نص/خصائص/ألواح/زوم; add-mode
    click places a native-contenteditable Arabic box; drag handle; Delete
    key; per-artboard boxes; zoom re-render), pdfOverlayExport.ts (overlay on
    the ORIGINAL vector PDF: PDFDocument.load + embedFont(subset) + drawText
    with align anchors right=x-is-right-edge), svgDesign.ts (DOMParser →
    shadow root — Illustrator .st0 classes must not leak; dblclick a <text> →
    overlay textarea at its rect (inline computed styles first, class removed
    — presentation attrs lose to CSS), commit collapses kerning tspans to
    one; PS font names ArialMT/Cairo-Bold → cleaned family + weight + Arabic
    fallbacks; new boxes become <text direction=rtl text-anchor=start>;
    XMLSerializer with xml prolog). PNG export composes bg + canvas fillText
    (native Arabic shaping).
  • Wiring: 3-way pill (sheet/word/design; knob at i*100/3%); dirtyMux 3-way;
    routing by extension everywhere incl. boot argv (.ai/.svg/.pdf/.eps →
    design, with the same 400ms autosave-preserving boot as docx); design
    menu branch (save→sidecar[+svg], save-as/print/export-pdf→overlay PDF);
    electron: file:read-silent/file:write-silent (recents stay clean — the
    normal handlers append to recent files!), save-as kinds pdf/png/svg,
    OPENABLE_EXT + builder associations ai/svg. EPS → Arabic convert-first
    message (no practical wasm renderer worth 20MB AGPL).
  • LIVE-VERIFIED: تصميم.ai (A4, shapes+Arabic) opens as full-fidelity
    background, status A4; add text «اسم الزائر: حسن حامد 07717835312» (zero
    intact), save → sidecar json next to the file, relaunch → box restored in
    place; تصميم.svg (Illustrator-style: .st1 class, ArialMT, kerning tspans)
    mounts in shadow root, dblclick opens editor, edited text committed and
    SAVED to the svg (old text gone, structure valid, .bak created).
    KEY FIX: .dz-boxlayer needs pointer-events:none (boxes re-enable auto) —
    it sat over the svg and swallowed the dblclicks.
  • Unit tests tests/design.test.ts (10): bidi runs (phone number, dates,
    codes), sidecar round-trip + hostile-value clamping, REAL pdf overlay
    export (fresh page + layered on existing pdf), PS font normalization.

- ✅ WORD MODE (المستندات) DONE (2026-08-13) — manager asked for a Word-file
  tool inside EXELMJ with a rounded sliding switch between the two tools.
  • MODE SWITCH src/word/modeToggle.ts: fixed pill (top inline-start corner,
    on <body> outside the mirrored sheet host), labels الجداول/المستندات, white
    knob sliding via inset-inline-start transition. setMode flips #app vs
    #word-app and saves/restores document.title. enterSheet →
    refreshRtlMirror(): the grid may have been (re)built while hidden — and
    rtlMirror.refreshRtlMirror now ALWAYS zoom-nudges (not only when the mirror
    is active) because a grid whose first paint happened under display:none
    comes back BLANK otherwise (seen live). The docx-boot path also waits 400ms
    after newWorkbook so the async RTL default doesn't race the hide.
    Verified: 4 consecutive docx-boot → sheets round trips, mirror + paint OK.
  • EDITOR src/word/wordApp.ts: TipTap 3.30.0 (StarterKit, TextAlign,
    TextStyleKit, Highlight multicolor, TableKit resizable, Image inline/base64/
    resize, custom Direction ext with per-paragraph dir) — a native
    contenteditable, so the BROWSER does Arabic bidi/shaping/caret (the exact
    thing Univer's canvas lacks; that's why sheets needed rtlMirror). Arabic
    toolbar (file/undo/font(cached systemFonts)/size-pt/B-I-U-S/colors/
    headings/lists/4 alignments/dir/table ops/image/clear), unsupported-parts
    notice bar, word+char status bar. Lazy-loaded chunk (~900KB, separate from
    the 9MB main bundle); a failed chunk load resets the cache and drops back
    to sheets instead of dying forever.
  • DOCX I/O (in-house, same precedent as src/xlsx/ — mammoth REJECTED because
    it drops alignment/direction/fonts/colors):
    - src/word/docxImport.ts: JSZip + fast-xml-parser 5 (preserveOrder,
      parseTagValue:false — leading-zero phone numbers survive). Resolves
      w:bidi + LOGICAL w:jc (start=right under bidi; kashida trio → justify)
      through styles.xml docDefaults + basedOn chain + outlineLvl headings.
      Inline containers walked IN ORDER (w:hyperlink kept as <a> via rels
      TargetMode=External, w:ins/w:fldSimple/w:sdt recursed — a || shortcut
      here used to DELETE hyperlink text from mixed paragraphs). Lists nest by
      ilvl (renderListRun); tables get real rowspans from w:vMerge + colspans
      from gridSpan; images via rels→media data URLs (EMU→px ÷9525). All
      attribute-bound values validated/sanitized (hex colors, font charset,
      highlight whitelist) — file content cannot break out of an attribute.
      Warnings ['headers','footnotes','textboxes'] → notice bar (lossy save).
    - src/word/docxExport.ts: TipTap JSON → docx@9.7.1. Every RTL paragraph
      gets bidirectional:true PLUS explicit alignment (docx#3419: bidi alone
      renders left-stuck); physical align ⇄ logical START/END mapping is the
      exact inverse of the importer (round-trips without flipping — the classic
      Arabic bug); Arabic runs get w:rtl; bold/italic/size always emit the
      complex-script mirrors (w:bCs/w:iCs/w:szCs — else Arabic stays unbold in
      Word); fonts set ascii+hAnsi+cs; tables visuallyRightToLeft + rowSpan→
      vMerge; nested lists keep their OWN kind, ordered lists restart per
      instance (levels clamped to the 0-2 numbering config); links →
      ExternalHyperlink; webp/svg images skipped (a false 'png' type would
      corrupt the file). Default style Arial 11pt (+CS).
  • INTEGRATION src/main.ts: unified Open dialog routes by picked extension
    (docx → word mode, else sheets); 'open-path' (recent/second-instance/argv)
    routes the same; word-mode menu branch handles new (confirm-guarded via
    requestNew)/save/save-as/print/export-pdf/undo/redo and save-then-close
    saves ONLY the dirty documents (both modes mirror this); sheet-specific
    fmt-* actions are ignored while word is visible. Dirty is multiplexed
    (src/word/dirtyMux.ts: sheetDirty||wordDirty → main's single close-guard
    flag; DocController.setDirty reports through it). Boot: pending docx keeps
    the autosave-recovery priority for the sheet side (a crash recovery must
    survive double-clicking a docx).
  • ELECTRON: file:open filters + docx; file:save-as kind param ('docx' filter)
    + now writes a .bak like file:save; print:html accepts
    {preferCSSPageSize} (word print/PDF uses @page A4 margin 20mm from
    src/word/printDoc.ts through the existing hidden-window channel);
    OPENABLE_EXT + electron-builder fileAssociations include docx; setLanguage
    now warns before its renderer reload when the dirty flag is set (used to
    silently destroy unsaved work).
  • QA SWEEP 2026-08-18 (130 live checks on the installed 0.4.0 through CDP) —
    7 confirmed defects, all fixed, plus the missing essentials it exposed:
    - LINK BUTTON WAS DEAD: it called window.prompt(), which Electron refuses
      outright ("prompt() is and will not be supported") — the click threw and
      nothing happened. src/word/askForm.ts is now the in-app modal for the
      link (and for the header/footer and page-setup dialogs); it lives on
      <body>, outside any mirrored host, and handles Esc/Enter/backdrop.
    - OPEN ATE UNSAVED WORK: WordApp.openDialog had no dirty check, so picking
      a file silently discarded the current document. It now runs the same
      confirmDiscardThen guard as "new".
    - PRINT FAILED SILENTLY: webContents.print() rejects with "Invalid printer
      settings" BEFORE any dialog when the default printer is offline, and the
      catch swallowed it. The renderer now alerts (wordPrintFailed) and offers
      print:printers so the user can pick a working device — never an
      automatic fallback, which would send paper to a surprise printer.
    - IMAGES WERE SQUASHED IN WORD: setImage(...).updateAttributes('image') did
      not land on the new node, so docxExport used its fixed 300x200 fallback
      (a 640x300 chart exported at ratio 1.50). Size now goes in WITH setImage,
      and docxExport.intrinsicSize reads PNG/JPEG/GIF/BMP headers so even a
      pasted image without attributes keeps its aspect ratio.
    - FONT PICKER: systemFonts.slice(0, 300) truncated the list alphabetically
      (no Tahoma / Times New Roman / Segoe UI on this machine) and offered
      hidden faces (". Semi", a blank name) whose names are invalid CSS
      identifiers — choosing one wrote style="" and did nothing. src/word/
      fonts.ts:usableFonts filters them at the source (sheet picker included),
      the cap is gone, common faces are pinned in their own optgroup, and the
      family is applied QUOTED (JSON.stringify) so "29LT Adir" works too.
    - LINE SPACING: TipTap's LineHeight is a text-style MARK, so a caret in the
      paragraph did nothing and a selection wrapped a span. Replaced by
      src/word/lineHeight.ts (paragraph attribute, TextStyleKit lineHeight
      disabled), exported as w:spacing/@w:line and read back on import.
    - CUSTOM HIGHLIGHT WAS LOST ON REOPEN: export writes w:shd for colours Word
      has no name for (correct), but the importer only read w:highlight. It now
      reads run shading too.
    - Also: Direction.setDirection used `every`, which short-circuits before
      headings ever get the attribute — both it and the new extensions use
      `map(...).some(Boolean)`.
  • ADDED IN THE SAME PASS (the gaps the sweep found):
    - FIND & REPLACE src/word/findReplace.ts: a ProseMirror plugin owning the
      match list + decorations, and a bar docked under the ribbon (Ctrl+F/H,
      Enter/Shift+Enter to step, replace, replace all, match case). Matching
      runs over a FLATTENED doc with a \u0000 separator per block, so a phrase
      still matches across bold/coloured runs but never spans two paragraphs.
    - PAGE SETUP + HEADER/FOOTER src/word/pageSetup.ts: one model in
      millimetres feeding four consumers — the on-screen sheet, the page
      guides, the print @page block and the docx sectPr. Header/footer text
      and page numbers go to Chromium's OWN band (printToPDF headerTemplate/
      footerTemplate; print header/footer options) because a live page number
      cannot be produced from page content, and to real w:hdr/w:ftr parts in
      the docx. importDocx now READS them back (bandFromXml + readSectionSetup)
      and no longer warns about plain-text bands — only about ones carrying
      drawings/tables it still cannot model.
    - PAGE GUIDES: dashed line + "صفحة n" at every page boundary, measured from
      the TEXT height (offsetTop/offsetHeight, so the zoom transform is moot) —
      measuring the sheet reports 2 pages for an empty document. Status bar
      shows صفحة x من y with the caret's page.
    - AUTOSAVE + RECOVERY for documents: autosave:save/get/clear gained a kind
      param ('sheet' keeps the old file names, 'word' → autosave.docx +
      autosave-word.json). Debounced 6s, never overlapping, cleared on
      save/new/open; on first mount (1.5s in, so an "open with" file wins) an
      unsaved document is offered back. Verified live by killing the process.
    - SPELLCHECK: webPreferences.spellcheck true + a context menu with
      dictionarySuggestions and "add to dictionary". Chromium ships NO Arabic
      dictionary (session.getSpellCheckerLanguages() → ["en-US","en-GB"]), so
      this only helps the Latin text — and the editor keeps lang="ar", which is
      what stops every Arabic word from being squiggled by an English one.
    - TABLE EXTRAS: merge/split cells, header-row toggle, and cell shading
      (src/word/tableShading.ts global attribute → w:shd, read back on import).
    - Tests: tests/wordFeatures.test.ts (16) covers image sizing, line spacing,
      shading/highlight, the page/band round trip, the font filter and the
      matcher; tests/docx.test.ts's header warning test was rewritten for the
      new contract. 1211 vitest tests green.
  • SECOND WAVE 2026-08-18 (0.6.0) — Word parity where the manager asked for it:
    - WORD-STYLE TABLE HANDLES src/word/tableTools.ts: an overlay (never inside
      the contenteditable) drawing a strip over every column and beside every
      row, a ✛ corner and a ⊕ at each boundary. Clicking a strip builds a real
      prosemirror-tables CellSelection (colSelection/rowSelection), so shading,
      delete and merge then act on the whole column/row exactly as in Word.
      Geometry comes from getBoundingClientRect, so RTL needs no special case.
      The grid picker also gained "إدراج جدول بمقاس محدد…" (rows/cols/header).
    - CELL SHADING through prosemirror-tables' selectedRect instead of
      commands.updateAttributes: with a plain caret (no cell selection) that
      helper never reaches the enclosing cell, so the paint button did nothing
      after simply typing in a cell.
    - PDF → EDITABLE DOCUMENT src/word/pdfLayout.ts (pure, tested) +
      src/word/pdfToDoc.ts (pdfjs): opening a .pdf from the word ribbon rebuilds
      it as a document — runs → lines → paragraphs, with headings from relative
      font size, alignment/direction from the line box, lists from the marker
      (including the ".1" a PDF writes for an RTL "1."), and TABLES from lines
      that share column bands. Two rules earned by live tuning: columns match by
      SPAN OVERLAP (a right-aligned value never starts where its header does)
      and a table needs a real empty band between columns (≥14pt) — without it
      every line holding a number read as a two-column table. Row spacing is
      judged against the page's own median line pitch, not the font size.
    - The extraction itself gained two fixes in src/design (shared with the
      design mode): normalizeArabicText now maps the Persian look-alikes a PDF
      cmap hands back (ی/ک/ھ → ي/ك/ه), and the run merge inserts the WORD SPACE
      the producer never encoded ("یوضحھذا" → "يوضح هذا").
    - WORD EXTRAS src/word/wordExtras.ts: a real page break (Ctrl+Enter,
      w:br type=page), superscript/subscript (w:vertAlign), paragraph spacing
      before/after (w:spacing @before/@after). Plus heading 4, a quote style
      (indented + ruled paragraph in docx), a horizontal rule, insert-date
      (Gregorian + Umm al-Qura Hijri), formatting marks (¶) and Word's format
      painter (remember the marks, paint the next selection).
    - The status bar's page number now refreshes on SELECTION change, not only
      on edits — it tracks the caret's page the way Word's does.
    - tests/wordExtras.test.ts (13) covers the PDF layout rules and every new
      docx mapping; 1224 vitest tests green. Verified live on the installed
      0.6.0: the handles, a converted 2-page PDF (headings, ordered list, RTL
      table with its columns in the right order) and every new button.
  • PDF IMPORT, FIDELITY PASS 2026-08-18 (0.7.0) — "it must look like the file":
    - EVERY RUN KEEPS ITS TYPE: point size, family (subset tag and style suffix
      stripped), weight/slant and colour. Weight comes from pdfjs's own font
      descriptor, not just the name — a producer that embeds one family per
      weight (Chromium) leaves nothing in the name to read.
    - INK COLOUR is sampled off the rendered page, because a PDF's text layer
      carries none. Two rules earned the hard way: the page is RENDERED BEFORE
      its runs are read (pdfjs only resolves font objects once the operator
      list has run), and runs are merged only AFTER sampling and only when they
      share a colour — merging first glues a red phrase to the black words
      beside it and the colour is lost. Near-neutral dark samples snap to black
      so anti-aliasing does not put a colour span on every paragraph.
    - PICTURES: src/design/aiBackground.ts gained imageRects(), which replays
      the operator list with a CTM stack and maps the unit square through the
      current matrix. The word importer CROPS those boxes out of the page
      render — masks, CMYK JPEGs and clipping all come out right without
      decoding an image object by hand. Full-page washes and single-colour
      crops are dropped; the picture lands in reading order, centred when the
      page centres it.
    - THE DOCUMENT ADOPTS THE FILE: paper size + orientation, margins measured
      from where the content sits, the body point size (PageSetup.baseFontPt)
      and its leading, and the reading DIRECTION — an English statement no
      longer lays out right-to-left just because the UI is Arabic.
    - The leading is the lower quartile of same-column steps with table rows
      excluded: the mode of a statement is its ROW pitch, and using that
      double-spaced every ordinary paragraph.
    - Verified on a real bank statement (6pt, two-column header, 45-row table,
      logo) and on an Arabic report PDF: both rebuild at the original size with
      colour, weight, table and picture intact. 1228 vitest tests green.
  • PDF IMPORT, LAYOUT PASS 2026-08-18 (0.8.0) — the manager put the original
    and the conversion side by side; four things made them differ, all fixed:
    - EVERY BLOCK NOW CARRIES ITS OWN ALIGNMENT, images included. A paragraph
      with none inherits TextAlign's default, which is RIGHT under an Arabic UI
      — that alone moved a logo drawn on the left edge over to the right.
    - BORDERS ARE COPIED, NEVER INVENTED. aiBackground.pageRules() returns every
      stroked path's box (pdfjs already reports those in USER space — applying
      the CTM again, as the image rects must, shifts every rule). A ruled table
      is drawn as one little rectangle PER CELL, so the segments are grouped by
      height and their widths summed: a row whose segments span the block is a
      ruled row. Unruled column blocks ("Bank: … Page: …") stay borderless,
      through the editor, the print sheet and the docx (the flag lives on the
      CELLS, since a resizable table renders through TipTap's own node view and
      drops attributes set on the table).
    - DRAWN BOXES BECOME BORDERED CELLS, side by side when they sit side by
      side, so a statement's two info panels come back as panels. Boxes claim
      RUNS, not whole lines: a table header is one box per column but its text
      is a single line across all of them, and matching lines left that row
      empty. Grid cells are excluded by height so the transaction table is not
      shredded into 250 little boxes.
    - COLUMN ALIGNMENT COMES FROM THE DRAWN CELL BOX (0.8.1): the vertical rules
      give each column its real left and right edge, so a lone "-" sitting 45pt
      from its cell's left edge and 3pt from its right reads as right-aligned —
      its own extents say nothing, since it hugs neither. Where the file draws
      no grid, the fallback is which edge the cells hug, ties going to the
      reading edge (a column of equal-width dates flickered otherwise). Dates
      and text come back left, amounts right, exactly as the file has them.
    - A grid row can no longer masquerade as a drawn box: a candidate box with a
      rule running ACROSS it is a table, and the column detector owns it.
    - COLUMN WIDTHS (0.8.2) are copied too, as TipTap's `colwidth` on each cell,
      taken from the drawn cell boxes (or the midpoints between content bands
      when the file draws none) and carried into the docx as TableCell widths.
      Every column coming out the same width was the last thing that still read
      as "not the same document": the statement now measures 93/253/53/100/67/
      99px against the file's 70/190/40/75/50/74pt.
    - A row of ONE-LINE boxes is a table header, not a set of panels: its runs
      stay in the flow so the table below adopts them as its first row instead
      of a separate one-row table floating above it.
    Verified against the user's own bank statement: logo, title, unruled header,
    two info boxes, ruled 47-row table with its real header row. 1232 tests.
  • DAILY-OFFICE BUNDLE 2026-08-19 (0.9.0) — what an office actually reaches
    for, checked against what Word ships and what the other editors do:
    - COLOUR BUTTONS OPEN A PALETTE. The split button (icon applies the last
      colour, a swatch input opens the OS picker) confused the manager: he
      pressed the icon and expected to SEE colours. Now the icon opens a 32-swatch
      palette with "بدون لون" and "ألوان أخرى…" (the native picker) under it.
    - TEMPLATES src/word/templates.ts: formal letter, quotation with a totals
      table, meeting minutes, internal memo — dated on the day they are used.
    - TEXT ⇄ TABLE and SUM THE COLUMN src/word/tableOffice.ts (pure, tested).
      The number parsing is the real work: ١٢٣٤ and 1234, ٬ and , for thousands,
      ٫ and . for decimals, a currency word after the figure — and the total is
      written back in the SAME digits and decimal count it read.
    - WATERMARK on the sheet, in the print stylesheet (position: fixed repeats
      it on every printed page) and in the docx header, since Word draws a
      watermark as a header shape and the docx library has no shape API.
    - TABLE OF CONTENTS built from the document's own headings, page numbers
      taken from the same measurement the page guides use.
    - ARABIC-INDIC ⇄ WESTERN DIGITS across the selection (or the document).
    - DOCUMENT STATISTICS: words, characters with/without spaces, paragraphs,
      tables, images, pages.
    - The unsaved-changes guard moved off window.confirm onto the app's own
      modal: the native one freezes the whole renderer while it is up.
    - tests/wordOffice.test.ts (11) covers the numbers, the separators, the
      templates and the watermark's trip through docx; 1244 tests green, and
      every button verified live on the installed 0.9.0.
  • OFFICE REVIEW BUNDLE 2026-08-19 (0.10.0) — built from the GitHub sweep in
    docs/oss-research-2026-08-19.md, after the owner confirmed EXELMJ is never
    distributed (so copyleft licences cannot trigger; see the same doc).
    - REPEAT HEADER ROW. Two surfaces, two mechanisms: the print HTML lifts a
      leading all-<th> row into <thead> (src/word/printDoc.ts promoteHeaderRows)
      with display: table-header-group, and the exporter sets tableHeader on the
      TableRow so Word repeats it too. Verified by printing a 70-row Arabic
      statement through Chromium and reading the PDF back: the header is on
      pages 2 and 3, under border-collapse: collapse.
    - "صفحة X من Y" in the printed band: Chromium fills .pageNumber/.totalPages
      itself, so the label travels renderer → ipc as bands.pageLabel.
    - PAGE COUNT NOW COUNTS MANUAL BREAKS (src/word/pageSetup.ts pageStarts /
      pageAt). A document of short letters separated by page breaks reported
      "page 1 of 1"; the count was pure text height. Found by live testing the
      mail merge, not by a test.
    - MAIL MERGE src/word/mailMerge.ts + mergeField.ts: an atom node «field»
      (own code, ~150 lines) filled from the sheet open in the OTHER mode
      (DocController.activeSheetCells → sheetToRecords). The merge clones the
      ProseMirror document per record and swaps each field node for its text,
      so screen, print, PDF and .docx stay one code path. An unmerged field
      exports as a real Word MERGEFIELD (SimpleMailMergeField).
    - TAFQIT src/word/tafqit.ts: amounts in Arabic words, vendored from
      MohsenAlyafei/tafqit (MIT) and typed. Ours: the currency table (IQD/SAR/
      AED/KWD/EGP/USD/EUR with the four counted-noun forms and the right subunit
      base — 1000 fils, 100 halalas) and the cheque wrapper. Fixed upstream's
      construct-state bug: مائتا only when the noun follows directly, مائتان
      when tens follow. Field types: column, date, hijri (Intl umalqura through
      src/univer/hijri.ts serialFromDate), record number; format plain | words.
    - COMMENTS src/word/comments.ts + commentPane.ts, anchored by
      @sereneinserenade/tiptap-comment-extension (MIT, zero deps). Threads with
      replies, resolve/reopen, edit, delete. The gutter follows the DOCUMENT
      direction — left margin for Arabic, like Word — not the UI language.
      Full round trip: CommentRangeStart/End + a real comments part on export
      (replies carry parentId, so Word shows a thread), and readComments() on
      import, with the mark id and the thread id sharing the "w" prefix.
    - TRACK CHANGES via tiptap-track-changes (MIT, zero deps). Suggestion mode,
      accept/reject one or all, a pending count in the status bar. Export maps
      the insertion/deletion marks to InsertedTextRun/DeletedTextRun so Word
      shows NATIVE revisions; import reads w:ins/w:del (and w:delText) back.
      Two traps found by testing, both fixed: docx wants id/author/date FLAT on
      the run options (nesting them under `revision` writes w:rPrChange, a
      formatting change, and Word shows no revision at all), and TipTap's
      default attribute parser reads getAttribute(attrName) with NO data-
      prefix — emitting only data-* gave an <ins> with every attribute null.
    - FOOTNOTES via tiptap-footnotes (MIT, zero deps) at @tiptap/core 3.30.0 —
      no version bump was needed after all. Two requirements the README makes
      and the code enforces: the Document content rule must be
      'block+ footnotes?' (StarterKit's Document is replaced), and every <li>
      needs BOTH `id` and `data-id` or ProseMirror rejects the document.
      addFootnote() only inserts the marker, so wordApp moves the caret into
      the new note itself. Export writes FootnoteReferenceRun + a real
      footnotes part (the list is kept out of the body); import reads
      footnotes.xml, skipping Word's separator entries.
    - A FAILED OPEN NO LONGER FREEZES THE APP: the catch used window.alert,
      whose native modal blocks the renderer until someone clicks OK — the
      notice bar carries the message instead.
    - tests/wordHeaderRow.test.ts (15), tests/pdfArabic.test.ts (3, from a real
      Chromium-printed Arabic PDF: one glyph per item, presentation forms),
      tests/tafqit.test.ts (13), tests/mailMerge.test.ts (14),
      tests/wordComments.test.ts (13), tests/wordTrackChanges.test.ts (5),
      tests/wordFootnotes.test.ts (8). vitest.config.ts now stubs Vite's
      `?worker&inline` suffix and aliases pdfjs to its legacy build, which is
      what finally made the PDF layer testable at all.
  • REVIEWED: 3-dimension adversarial multi-agent review; 17 confirmed findings
    all fixed (hyperlink text loss, attr injection, kashida, nested lists both
    ways, vMerge both ways, on/off toggles, chunk-failure caching, autosave
    clobber, discard confirms, save error handling, save-as .bak, neutral
    close-guard wording) — each with a regression test. 71 vitest tests green
    (19 in tests/docx.test.ts). Verified live on the built app: open Arabic
    docx via argv (centered H1/right paragraphs/bullets/RTL table/07-phone),
    type→dirty *, save→.bak→clean reopen, LTR/RTL grids unaffected.
  • KNOWN LIMITS (v1, by design): headers/footers/footnotes/textboxes are
    dropped on save (user is warned + .bak kept); page breaks import as line
    breaks; localized heading styles rely on outlineLvl; no autosave for word
    documents; language switch reloads to sheet mode.

- ✅ RTL ALIGNMENT + RTL LIST-DROPDOWN FIX DONE (2026-08-10) — two manager field
  reports on the same report file (زيارة … _Report.xlsx, Google Sheets as his
  reference): text "not in the correct RTL direction", and an Excel-made
  dropdown that "does not work".
  • EVIDENCE FIRST: his file was read straight from the zip + exceljs — the
    sheet carries rightToLeft="1" and EVERY cell carries
    alignment={horizontal:'right',vertical:'middle',readingOrder:'rtl'}, and
    styleMap.excelStyleToUniver imports that faithfully (H_ALIGN.RIGHT=3). So
    import was never the problem. His file also carries ZERO dataValidation
    entries — the dropdown he means lives in another file.
  • ALIGNMENT ROOT CAUSE: the scaleX(-1) mirror flips the column order (wanted)
    AND the content's position inside each cell (not wanted) — a right-aligned
    cell is painted at its right edge and the flip lands it on the visual LEFT.
    Reproduced pixel-for-pixel against his screenshot via CDP.
    FIX src/univer/rtlAlign.ts: a CELL_CONTENT interceptor (effect Style,
    priority 0 so DV/numfmt run first) swaps EXPLICIT ht left⇄right through
    cell.interceptorStyle on rightToLeft sheets only — Styles.getStyleByCell
    merges interceptorStyle over the cell style, so nothing is written to the
    workbook and save/export/autosave are untouched. Unset alignment is left
    alone → General keeps Excel's RTL behaviour (text right, numbers left), the
    manager's explicit choice. NOTE: the sheet services do not exist yet when
    createUniver returns ("[redi]: Expect 1 dependency item(s)"), so
    registration retries on LifeCycleChanged + [100,400,1200]ms.
    Verified live: names/numbers/phones now hug the right edge and headers stay
    centered — matches his Google Sheets screenshot.
  • DROPDOWN ROOT CAUSE: A/B on two exceljs files identical except
    views[0].rightToLeft — mirror OFF, Univer's list opens on the FIRST click
    (literal AND range-sourced); mirror ON, it never opens at any x across the
    cell. Not coordinates (the browser already maps offsetX through the CSS
    flip: clientX 947 → offsetX 479), not the rule, not the widget (hovering the
    chip still switches the cursor → isHit + onPointerEnter fire), not the popup
    layer (the column filter menu opens fine under the mirror) and no console
    exception — Univer's own pointer-down → show-dropdown path is what dies
    inside the flipped host.
    FIX src/univer/rtlDropdown.ts: RTL sheets get our own list — a DOM popup
    appended to <body> (OUTSIDE the mirrored host, so never flipped), opened by
    a click (drag-filtered, 60ms after pointerup so Univer's selection has
    landed) on a cell whose rule is `list`, writing the pick via the facade.
    Options accept Univer's JSON form, the plain comma form, and range-sourced
    lists (resolved through getSheetByName + getRange). LTR sheets are untouched
    and keep Univer's native dropdown (regression-verified).
  • Verified on the built app: pick writes the value, the range-sourced list in
    a second sheet resolves, and the LTR file still shows Univer's own dropdown
    and never ours. 52 vitest tests pass (5 new in tests/rtlAlign.test.ts).
  • Upstream check (2026-08-10): Univer STILL has no RTL renderer in any
    published release — 0.25.1 is the newest stable, issue dream-num/univer#2094
    is backlog ("We are not actively seeing into this") and PR #7011
    (feat(rtl): end-to-end RTL) is open, unmerged, based on the v0.25.0 tag. So
    upgrading is not an escape from the mirror.
  • KNOWN LIMIT: the alignment swap reads the CELL's style; a sheet that sets
    alignment only at ROW/COLUMN level still mirrors. Not seen in the field.

- ✅ OPEN-WITH + OPENED-FILES-EMPTY FIX DONE (2026-07-23):
  • «Open with» / double-click: electron-builder.yml fileAssociations registers
    xlsx/xlsm/csv (icon resources/icon.ico) — EXELMJ shows in the Windows
    "Open with" list (registry-verified: Applications\EXELMJ.exe\shell\open\
    command + per-ext ProgIds). main.ts fileFromArgv() picks the launch file
    from argv; first launch stashes it in pendingOpenFile and the renderer pulls
    it race-free at boot via file:pending-open (preload getPendingOpenFile) →
    doc.openPath; the single-instance second-instance handler forwards the file
    to the running window (open-path) + focuses. Boot priority: opened file >
    autosave recovery > new. Verified: launching EXELMJ.exe with an .xlsx arg
    opens + renders it (title + data).
  • ROOT-CAUSE FIX for the manager's "previously-saved sheets open EMPTY": RTL
    files opened into a running app rendered with FULLY REVERSED text (المنتج →
    جتنملا) — illegible, read as "empty/broken". Univer caches the rendered text
    scene; resize/scroll only RE-BLIT it (fillText, where the mirror counter-
    flips, never re-runs), so content drawn before the mirror activated on a
    swap stays reversed. Fix: rtlMirror.refreshRtlMirror (called from
    replaceWorkbook) now calls forceReflow() — a ZOOM NUDGE via the FUniver api
    (ws.zoom(z±0.001)→restore) which is the ONLY reliable way to force a full
    text re-render (verified: a 100→110% nudge fixed reversed text instantly;
    resize/scroll do nothing). Gated on active (RTL) so LTR opens are untouched.
    Verified live in the packaged app: RTL file opens upright.
  • ✅ FIXED (2026-07-23): the formula bar (fx) AND the in-cell editor showed the
    active cell's Arabic text REVERSED (المنتج → جتنملا). RCA via live fillText
    probe: Univer's RTL doc engine hands BOTH doc buffers (DETACHED, single-line,
    blit to univer-doc-main-canvas) the text ALREADY reversed, in ONE fillText
    call, drawn without bidi — NOT our mirror (buffers are the DOC engine, not the
    sheet engine; a plain string un-reversal is the exact inverse of Univer's
    single-call reversal, restores mixed digits/latin too). KEY INSIGHT: Univer's
    caret / hit-test math is already RTL-correct — only its text DRAWING reverses
    — so un-reversing the string ALSO keeps the caret, typing and selection
    aligned (no caret desync). Fix in rtlMirror.ts wrapText: for `isDocTextBuffer`
    draws containing Arabic, draw `[...s].reverse().join('')`, gated on `active`.
    isDocTextBuffer = detached && (docTextBuffers.has(c)  // tagged on blit to
    univer-doc-main-canvas — exact, grid never composites there || (height<=50 &&
    (width>600 /*fx bar, always*/ || editingCell /*editor, only mid-edit*/))). The
    height/width/editingCell fast-paths give a FLASH-FREE first frame; the tag
    covers a tall multi-line / zoom-enlarged editor after its first blit. The GRID
    (sheet engine, tall buffers, composites through the sheet canvas) is never
    matched. Verified live in the built app: editor opens upright (no flash),
    typing Arabic works (المنتج+ات→المنتجات, correct shaping + caret), commit →
    grid shows it upright; fx bar A1/B1/A3 upright, B2 «10» untouched, grid intact
    through a forced re-render.
  • ✅ FULL BIDI EDITOR (2026-07-24, src/univer/rtlEditor.ts): the string-reversal
    above fixes PURE-Arabic but NOT mixed Arabic+Latin+digits, because Univer
    0.25.1's doc engine has NO Unicode Bidi Algorithm — ArabicHandler just
    unshift-REVERSES each Arabic run and lays runs LTR; `contentDirection` /
    `paragraph.direction` are stored but ignored by layout (confirmed by the
    research subagent reading engine-render + a live x-position probe: run "جتنم"
    drew at x=2 and "Apple" at x=26 regardless of textDirection=2). Manager asked
    for a real RTL/LTR system. Fix: while an RTL sheet's non-formula cell is being
    edited, cover Univer's (bidi-incapable) canvas editor with a native
    <textarea dir="auto"; unicode-bidi:plaintext> — the BROWSER does full bidi +
    Arabic shaping + caret + RTL flow. initRtlEditor(api) listens to
    set-cell-edit-visible: on visible=true for an RTL non-formula cell it opens the
    overlay over the cell-editor canvas rect (univer-doc-main-canvas NOT in
    <header>), pre-filled from the editor doc's logical dataStream, hides Univer's
    canvas (opacity 0), grows leftward. Commit writes the plain string via facade
    setValue (parses numbers AND formulas: '25'→25, '=1+1'→formula). Enter/Tab move
    + commit; Escape cancels; click-away commits via the visible=false listener
    (clicking a non-focusable canvas doesn't blur the textarea, so onBlur can't be
    relied on) with a deferred setValue that overwrites Univer's own stale commit;
    editCell is captured at OPEN (activeCell moves on click-away). EXISTING formula
    cells (getFormula startsWith '=') keep Univer's editor for autocomplete. The
    old string-reversal still runs on the now-hidden editor canvas (harmless) and
    still serves the FORMULA BAR (pure-Arabic view). Verified live in the built
    app: منتج Apple, الكمية 25 كيلو, شركة النور all correct-bidi + right-aligned;
    dbl-click / type-to-edit / Enter / Tab / Escape / click-away / formula-skip all
    pass.
  • ✅ FORMULA-BAR BIDI VIEW (2026-07-24, same file): the fx bar (a 2nd
    univer-doc-main-canvas INSIDE <header>) had the same no-bidi limit. Since this
    app never types into it (clicking it opens the cell editor via formulaBarFix),
    a READ-ONLY, pointer-events:none bidi <div id=exelmj-rtl-fx> is laid over it
    showing the active cell's value/formula in correct browser bidi (mirrors the
    live cell-editor overlay while typing), Univer's canvas hidden (opacity 0).
    pointer-events:none lets the click fall through to the canvas so formulaBarFix
    still fires. syncFxOverlay() runs on every CommandExecuted (rAF-coalesced) +
    on open/input/cleanup. Verified: fx shows «منتج Apple 25» correct + click-
    through opens editor + live-mirrors typing.
  • ✅ TOOLTIP FIX (2026-07-24): toolbar hover tooltips (Univer role=tooltip,
    z-1081) appeared as a clipped black bar — our overlays sat at a near-max
    z-index (2147483000/2147482000) and covered them. Lowered the cell-editor
    overlay to z-1001 and the fx overlay to z-1000 (above grid/canvas content,
    below Univer's tooltip/UI layer). Verified: «غامق» tooltip now shows fully;
    editing overlay still covers the cell.
  • ✅ MULTI-LINE CELLS (2026-07-24, same file): Alt+Enter now inserts a newline
    inside the overlay (Univer swallows the key, so onKeydown does the splice
    itself), the textarea is whiteSpace:pre-wrap with a PER-LINE lineHeight
    (fontSize*1.35, top-padded to stay centred for one line) and layout() grows it
    downward (capped to the viewport, then scrolls). On commit, a value containing
    \n also sets wrap-text via FRange.setWrap(true) — WITHOUT wrap the grid draws
    the whole value on ONE line and the breaks are invisible (verified: this was
    the actual missing piece, Excel does the same). The fx bar collapses \n to
    spaces (one-line bar, like Excel). Verified in the built app: two real lines
    «الشركة العربية» / «فرع Dubai 2024» with correct bidi, row auto-grew, and the
    saved xlsx round-trips ({A3:"…\n…", wrapText:true} read back via exceljs).
  • ✅ TYPING-DIES-AFTER-FIRST-EDIT FIX (2026-07-25, same file) — manager: «الكتابة
    تظهر وتختفي وتبقى الخلية فارغة». RCA by live trace: after our overlay closed,
    document.activeElement was BODY and keydowns targeted BODY — Univer keeps a
    hidden contenteditable (`__editor__<unitId>`) focused so typing on a SELECTED
    cell opens an edit session; our overlay took that focus and cleanup() never
    gave it back, so from the SECOND edit on no session opened and nothing was
    written. Fix: cleanup() now calls restoreUniverFocus() (getElementById(
    `__editor__${CELL_EDITOR_UNIT}`).focus({preventScroll:true})) deferred one
    tick. Also hardened: open() seeds+focuses one tick later (the key that STARTED
    the edit is still in flight on Univer's editor), and onKeydown stopPropagation
    for un-modified keys so Univer's global handlers can't mirror/steal focus
    mid-word (Ctrl/Cmd/Alt combos still pass through for save/undo).
    Verified on the INSTALLED build: four consecutive cell edits all commit.
    TESTING TRAPS that hid this for several rounds (see Lessons-Learned): assert on
    the CELL value/screenshot after commit — never only on the overlay's ta.value;
    cdp.py `key` drops modifiers; fullkey.py must not set `text` on keyDown AND
    send a `char` event (double-insert artifact); cdp.py clicks are CSS px while
    screenshots are device px (÷1.25) or the click silently misses the grid.
    KNOWN LIMIT: new formulas typed fresh in the overlay commit correctly but
    without live autocomplete.
  • KNOWN MINOR (edge): a MULTI-LINE (Alt+Enter) or very-zoomed single-line editor
    can flash reversed for one frame before its buffer is tagged; steady state is
    correct. Mid-string caret hit-testing relies on Univer's RTL hit-test being
    correct (its caret math is); untested exhaustively.
- ✅ PROFESSIONAL CONTROLS PACKAGE DONE (2026-07-23) — manager asked for finer,
  more professional controls (concrete example: could NOT remove borders, only
  add). New feature dir src/format/formatActions.ts wraps VERIFIED Univer facade
  APIs / command ids (checked against 0.25.1), all acting on the active
  selection, dispatched from electron/menu.ts via main.ts:
  • BORDERS incl. the previously-missing «بدون حدود» — FRange.setBorder(type,
    THIN, #000) with all 8 types (all/outside/inside/top/bottom/left/right/NONE).
  • merge-all / unmerge, wrap on/off, insert rows above/below + cols
    before/after, delete rows/cols, hide/show rows + cols, row-height /
    column-width (tiny numeric prompt — window.prompt is null in Electron),
    freeze-at-selection / unfreeze, clear format / content / all.
  • Insert menu enriched: new sheet, image, hyperlink, comment, =TODAY(),
    =HIJRITODAY(); Edit menu gains delete-rows/cols; new top-level «تنسيق» menu.
  • i18n en+ar (40 keys). Verified LIVE in dev: every action mutates the model
    correctly (borders bd set→cleared; insert/delete/hide/show/freeze/merge/wrap/
    clear/sizes; TODAY→2026/07/23, HIJRITODAY→1448/02/09; new sheet). Packaged
    app: full menu tree renders in Arabic + menu clicks dispatch/execute the real
    commands (dumped via main-process CDP on --inspect=9229). 47 tests + tsc
    green. Installer rebuilt.
  BONUS FIX (same session): AUTOSAVE-RECOVERY MIRRORED TEXT. A pre-existing bug
  surfaced during testing — after recovery (or any workbook swap) the grid drew
  Arabic text REVERSED until the first scroll, because rtlMirror's `host` still
  pointed at the disposed pre-swap host so the new canvases' text buffers were
  never tagged. Fixed: docController.replaceWorkbook now calls the new
  rtlMirror.refreshRtlMirror() which re-discovers the fresh host and fires
  repaints over an [80,260,550,950]ms settling window WHILE `active` stays true
  (the drawImage tagger is gated on `active`, so the earlier attempt that zeroed
  it made things worse). Reproduced by hand-crafting an Arabic RTL autosave.xlsx
  and launching under CDP — recovered البائع/أحمد/جدة/100 now renders upright.
- ✅ PIVOT TABLES DONE (2026-07-23) — the last Excel-replacement mountain, app-
  native (Univer's own pivot is Pro-only/forbidden). Feature dir src/pivot/:
  • pivotEngine.ts — PURE, Univer-free, fully unit-tested buildPivot(dataRows,
    spec, labels): rows-only OR rows×columns matrix; sum/count/average/min/max;
    row + column + grand totals; numeric-aware key sort; non-numeric ignored
    (except count); blank keys fold under "(فارغ)"; bucket ids NUL-joined so
    spaced keys can't collide.
  • pivotManager.ts — reads the source range via univerAPI, computes, creates a
    fresh TARGET sheet (FWorkbook.create), writes ICellData grid + light
    Excel-safe styling (bold headers/totals, fills, column widths), matches the
    source sheet's RTL flag. addPivot / refreshAll (recompute in place) /
    serialize / restore / clear; onChange → dirty.
  • pivotDialog.ts — ChartDialog-twin modal: range (prefilled from selection) →
    three field selects auto-filled from the range's header row → aggregation.
  • Persistence: defs ride snapshot.custom.exelmjPivots → chartMeta v3 pivots[]
    (source+target sheet ORDER indices, dropped if either sheet is gone) in the
    veryHidden _EXELMJ_META sheet; exportXlsx/importXlsx pass them through
    alongside exelmjCharts; docController wires new/open/template/save.
  • Menu: Insert ▸ «جدول محوري…» + «تحديث الجداول المحورية»; i18n en+ar.
  Verified: 13 pivot unit tests incl. FULL exportXlsx→importXlsx round-trip;
  end-to-end in the PACKAGED app via CDP (typed 6 Arabic data rows → menu →
  dialog → OK → new "جدول محوري 1" sheet rendered the RTL matrix أحمد 30/170/200،
  سالم 50/20/70، الإجمالي 80/190/270 with bold styled headers/totals). 47 tests
  + tsc green. Installer rebuilt.
- ✅ M1 DONE (2026-07-17): dev app + packaged app verified (grid, =SUM computes,
  bold/bg, merge, second sheet, undo/redo, new-workbook flow, window title).
  NSIS installer built: `release/EXELMJ Setup 0.1.0.exe`. Notes:
  `electronDist: node_modules/electron/dist` in electron-builder.yml is REQUIRED
  on this machine (see Lessons-Learned: EPERM rename during extract). Dev and
  packaged app share the same userData + single-instance lock — close one
  before launching the other.
- ✅ M2 DONE (2026-07-17): exceljs↔Univer converter (src/xlsx/) with style
  dedupe pool, shared-formula per-cell translation, date→serial, theme-color
  flattening; open/save/save-as dialogs + dirty tracking (mutation events,
  formula.mutation.* excluded) + close guard + recent files all wired; 13
  vitest round-trip tests green; full round-trip also verified in the live
  renderer (Arabic text, formulas, bold, 6.5KB file). CAVEATS: (a) Microsoft
  Excel is NOT installed on this dev machine — cross-check in real Excel is
  pending on a machine that has it (exceljs reload + Univer reopen used as
  proxy); (b) menu dialog flow verified by code path + IPC, manual click-through
  by the user pending.
- ✅ M3 DONE (2026-07-17): filter/DV/CF persistence via workbook resources
  (SHEET_FILTER_PLUGIN / SHEET_DATA_VALIDATION_PLUGIN /
  SHEET_CONDITIONAL_FORMATTING_PLUGIN — shapes captured from live save());
  exceljs read quirks handled (per-cell DV expansion → coalesced ranges;
  containsText read back as SEARCH() formula → needle extracted); 15 tests
  green; live hydration verified (imported resources re-save identically).
  UI features themselves (sort/filter/find-replace/CF/DV toolbars) are
  Univer-stock from M1 presets.
- ✅ M4 DONE (2026-07-17): charts (src/charts/): ChartManager (float-DOM
  lifecycle, addFloatDomToPosition with def.id as float id, position sync-back
  via getAllFloatDoms on serialize, refresh on sheet.mutation.set-range-values
  debounced 250ms), ChartFloat.tsx (echarts bar/line/area/pie + edit/delete),
  ChartDialog (native DOM modal, range from selection), Insert menu wired.
  Persistence: defs ride snapshot.custom.exelmjCharts → _EXELMJ_META veryHidden
  sheet (sheet-INDEX mapped, 30k char chunks) — 18 tests green; full live cycle
  verified (create→refresh-on-edit→save→reopen→restored with position/title).
- ✅ M5 DONE (2026-07-17): Arabic UI verified end-to-end (ar-SA engine locale +
  app-chrome ar.json, html dir=rtl, Arabic cell text + formulas OK; ?lang=ar
  query enables browser-preview verification); resources/icon.ico generated by
  scripts/make-icon.mjs (zero-dep PNG-in-ICO) and wired into electron-builder;
  final NSIS installer rebuilt (97.5MB); README-USER.md (bilingual) added.
  Packaged app launches with persisted language settings.
- ✅ M6 DONE (2026-07-17): perf pass at 10,000×20 (200k cells): export 0.77s
  (680KB file), import 0.60s, createWorkbook 72ms, spot-check value correct
  after round-trip. Fault injection: corrupt + truncated xlsx rejected with
  clean exceptions (app stays alive; docController shows localized openFailed
  alert). Final gate: tsc clean + 18/18 tests green.
- ✅ RTL SHEET DIRECTION (2026-07-17, post-v0.1.0 user request): Univer 0.25.1
  stores worksheet rightToLeft but its renderer ignores it (verified 3 ways:
  zero refs in engine-render/sheets-ui, official release notes "under
  development", and a canvas pixel probe — identical before/after). Delivered
  the full plumbing anyway: SetWorksheetRightToLeft command+mutation are
  registered manually in src/univer/setup.ts (Univer exports but never
  registers them); Arabic mode defaults every new/inserted sheet to
  rightToLeft:1 (docController insert-sheet listener); View-menu toggle
  ('toggle-sheet-rtl') flips the active sheet with a localized explanation;
  converter round-trips views[0].rightToLeft — files open MIRRORED (col A on
  the right) in real Excel. In-app mirroring turns on automatically the day
  Univer ships renderer support. 19 tests green.
- ✅ PACKAGE A "QUICK WINS" DONE (2026-07-17): (1) thread-comment + note
  presets enabled in setup.ts; (2) converter now round-trips FULL conditional
  formatting (colorScale/dataBar/iconSet/between — shapes ground-truthed live),
  RANGE-sourced validation lists ([unitId] prefix stripped on export), NOTES
  (exceljs reader is broken → own jszip parser src/xlsx/notesParser.ts; export
  via exceljs writer works), floating IMAGES (drawing JSON ↔ exceljs media,
  anchored at cell corner, EMU→px); (3) meta v2 stores original sheet ids +
  passthrough of Univer protection resources (in-app protection survives OUR
  files); (4) src/xlsx/csv.ts (own parser: delimiter autodetect , ; tab,
  windows-1256 fallback, BOM export) + File menu open/export CSV; (5) autosave
  every 2min to userData/autosave with boot-time recovery prompt; (6) 4 Arabic
  templates (invoice/payroll/budget/project incl. DV+CF showcase) under File >
  New from Template; (7) shortcut list documented in README-USER. 27 tests
  green; live hydration verified (colorScale renders, note+image+range-DV
  mount after an xlsx round trip; payroll formulas compute).
- ✅ PACKAGE D "FIDELITY SHIELD" DONE (2026-07-17): src/xlsx/fidelityShield.ts
  merges preserved parts from the ORIGINAL opened file into every export at
  zip level (jszip): vbaProject.bin (+ workbook CT switched to macroEnabled,
  .xlsm dialogs), pivotTable/pivotCache chains (sheet rels + workbook
  pivotCaches block with remapped rIds + Content_Types), per-sheet native
  drawing/chart chains (sheet <drawing> element injected before
  tableParts/extLst). Sheets matched by NAME (rename/delete → parts dropped
  gracefully, logged in FidelityReport; EXELMJ-image conflict → exported
  drawing wins). docController keeps pristine originalBytes (xlsx/xlsm only)
  and merges in snapshotBytes; merge failure falls back to plain export.
  Shared zip helpers extracted to src/xlsx/zipUtils.ts (notesParser
  refactored onto them). 30/30 tests green incl. handcrafted foreign-xlsm
  fixture (edit survives, exceljs reloads merged file). NOT preserved:
  slicers, defined names, form-control buttons wired to macros (the VBA code
  itself survives).
- ✅ RTL MIRROR DONE (2026-07-17, src/univer/rtlMirror.ts): renderer-level RTL
  sheets — column A visually on the RIGHT. Mechanism: CSS scaleX(-1) on the
  grid render host (browser maps pointer coords through transforms — no
  hit-test remap needed, verified); fillText/strokeText mirrored around each
  run's CENTER; buffer chain learned TRANSITIVELY at drawImage time (Univer
  double-buffers through detached canvases — see lesson b4d7b8a2); drawImage
  counter-flip for picture sources; ArrowLeft/Right swapped outside editors;
  our chart floats counter-flipped via body class. Activation follows the
  active sheet's rightToLeft flag (Arabic default ON, View-menu toggle).
  Visually verified via composite screenshots (final-rtl4). USER-PENDING:
  typing feel, context-menu position, drag ops — toggle available if quirks.
- ✅ EDITING-POLISH PACKAGE DONE (2026-07-18) — manager's 3 field reports:
  (1) CELL-EDITOR MIRROR FIX: the in-cell editor is a doc render unit INSIDE
  the mirrored host allocating a FRESH text buffer per frame, so blit-time
  tagging could never mirror its text in time — it displayed REVERSED (123 →
  "321"), which read as "Backspace/editing broken" in Arabic mode. Fix in
  rtlMirror.ts: canvases with id `univer-doc-*` are EXCLUDED from text
  mirroring/tagging and the editor overlay (host child wrapping that canvas)
  is counter-flipped via CSS :has rule → text double-flips back to readable.
  Repaints requested while a cell edit session is open (tracked via
  sheet.operation.set-cell-edit-visible) are DEFERRED to session close.
  Backspace itself verified Excel-correct both modes (filled cell → clears +
  opens editor; while typing → deletes; rigorous async protocol — see lesson
  on synchronous key-dispatch false failures).
  (2) FORMULA BAR COLD START (src/univer/formulaBarFix.ts): Univer 0.25.1's
  formula bar drops all input until a cell edit session exists (its editor
  unit is never primed by set-cell-edit-visible alone — verified live).
  Fix: capture pointerdown on the bar's canvas (the only canvas inside
  HEADER); if no session → swallow the click and synthesize a double-click
  on the ACTIVE cell via FRange.getCellRect (mirror-aware X when
  .exelmj-rtl-host active; scroll-to-range retry if the cell is offscreen)
  → session opens with content preserved, typing flows into cell + bar.
  With a session open the bar's native routing works and we step aside.
  (3) FONT LIST LAG: the font dropdown previews ~300 system fonts, each
  realizing a font file on first open. setup.ts injects
  `button[style*="font-family"] { content-visibility:auto }` so off-screen
  rows skip render + font realization; list opens instantly, loads on scroll.
  All verified live in ?lang=en AND ?lang=ar (type/backspace/enter matrix,
  cold formula-bar entry =5+6 → 11 via mirrored coords). 35 tests + tsc green.
- ✅ RTL CELL-POPUP POSITION FIX DONE (2026-07-18) — root cause of the manager's
  "most panels don't work" report. Univer anchors EVERY cell-attached popup
  (column-filter dropdown, data-validation list, comment/note bubble, hyperlink
  card) through SheetCanvasPopManagerService.attachPopupToCell, which positions
  them `position:fixed; left = canvasClientRect.left + sceneX` — i.e. from the
  UN-mirrored scene X (sheets-ui index.js ~line 20116). Under our scaleX(-1)
  grid mirror the cell is visually on the OPPOSITE half, so these popups opened
  detached on the wrong side. REPRODUCED in the packaged app via CDP: a filter
  funnel on right-hand column A opened its dropdown at the far LEFT (x=97 while
  the cell sat at x≈1350). Fix in rtlMirror.ts (installPopupMirror): a
  MutationObserver mirrors the inline `left` of every `section.univer-fixed`
  (the exact class of attachPopupToCell CanvasPopups) to `vw - left - width`
  while the mirror is active, with a WeakMap echo-guard so Univer's own
  reposition on scroll re-flips cleanly. Toolbar dropdowns (Radix poppers,
  transform-anchored to their header button — `[data-radix-popper-content-
  wrapper]`) and menus (`section.univer-popup`, button-anchored) are a DIFFERENT
  class and stay untouched — no regression. Formula autocomplete uses RectPopup
  anchored to the editor DOM (already mirror-correct). Verified in the REBUILT
  packaged app via CDP: filter dropdown moved 97→929 (now under its cell,
  screenshot pkg2-funnel-dropdown); color picker unchanged at x=675. 35 tests +
  tsc green. Observability note: computer-tool screenshots time out on this
  canvas page, but launching EXELMJ.exe with --remote-debugging-port +
  --remote-allow-origins=* lets a tiny CDP client (scratchpad/cdp.py) screenshot
  and trusted-click the REAL packaged app reliably — the standing way to test
  cell-anchored / interaction-driven UI. devicePixelRatio is 1.25, so read
  click coords from getBoundingClientRect (CSS px), NEVER off the screenshot.
- ✅ MANAGER PACKAGE DONE (2026-07-17): (1) column/row-level styles round-trip
  (importXlsx reads exceljs col/row style parts into columnData.s/rowData.s —
  Univer renders them, pixel-verified; exceljs drops styles on EMPTY rows,
  documented); (2) system fonts via queryLocalFonts (permission 'local-fonts',
  cached in settings.systemFonts, fed to UniverSheetsCorePreset
  customFontFamily, ≤300 entries); (3) HIJRI/HIJRITEXT/HIJRIDAY/HIJRIMONTH/
  HIJRIYEAR/HIJRITODAY custom functions (Umm al-Qura via Intl; registered at
  lifecycle Rendered/Steady — EARLY registration poisons names, verified;
  exporter writes their VALUES and stashes formulas in meta.customFormulas,
  import restores); (4) Arabic-Indic digits DISPLAY toggle (View menu,
  settings.hindiDigits, digit substitution inside the rtlMirror fillText wrap
  incl. row numbers, values stay western — visually verified hindi3.png);
  (5) print + PDF export: src/print/printHtml.ts builds a styled RTL-aware
  HTML table (merges, col widths, charts as echarts PNGs) rendered in a
  hidden BrowserWindow → system print dialog / printToPDF(A4). 35 tests green.
- KNOWN ISSUES (v1, by design/upstream): EXELMJ
  charts invisible in real Excel (data intact); unsigned installer →
  SmartScreen prompt; cross-app clipboard from Excel arrives as HTML (basic
  styles); exceljs comfort zone ≤ ~200k cells; error dialogs use plain
  alert() (native dialogs would be nicer — v2 candidate).
- Univer core preset supports `workerURL` (formula in a web worker) — not used;
  revisit only if large-file perf demands it (would need worker bundling).
- Installer is unsigned → SmartScreen warning on first run (documented; code
  signing cert out of scope v1).
- Known upstream limits: grid content stays LTR in Arabic UI (Univer RTL covers
  chrome only); paste from real Excel arrives via HTML clipboard (basic styles).

- Project cover: README.md displays docs/cover.png (user supplied image).
