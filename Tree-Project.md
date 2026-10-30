# 🌳 Project Map & Architecture Log
> Auto-updated: 2026-09-25 12:25:54

## 🧭 Architecture Summary

- **Type:** Node/JavaScript · TypeScript
- **Indexed:** 1058 source files (build artifacts & generated files excluded)
- **Languages:** BCMAP 504 · TypeScript 403 · JSON 35 · other 32 · PFB 30 · JavaScript 16
- **Entry points:** `backups/src-2026-08-15-0140/main.ts` · `backups/src-2026-08-15-2320/main.ts` · `electron/main.ts` · `src/main.ts`
- **Key files (most referenced):** `backups/src-2026-08-15-0140/i18n/i18n.ts` (×65) · `backups/src-2026-08-15-2320/i18n/i18n.ts` (×65) · `src/i18n/i18n.ts` (×65) · `backups/src-2026-08-15-0140/studio/icon/presets.ts` (×53) · `backups/src-2026-08-15-2320/studio/icon/presets.ts` (×53) · `src/studio/icon/presets.ts` (×53)

## 📁 (root)

- 🗂️ `.mcp.json`
  - *Purpose:* JSON data. Top-level keys: mcpServers.
  - *Last Modified:* 2026-08-14

- 🗂️ `.smart_notary.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-09-25

- 🗂️ `PROJECT_MAP.md`
  - *Purpose:* Documentation: PROJECT_MAP.md — EXELMJ — برنامج جداول لسطح المكتب يشبه اكسل (ويندوز، بدون إنترنت)، واجهة عربي/إنجليزي..
  - *Last Modified:* 2026-09-25

- 🗂️ `Proof-Report.md`
  - *Purpose:* Documentation: 🧾 Proof Report — المثبَت مقابل المدَّعى — > «خلص» كلمة يمنحها الخادم بعد التحقق، لا يدّعيها الوكيل. كل ادعاء غير مثبت يدخل دفتر الديون حتى يُث.
  - *Last Modified:* 2026-09-25

- 🗂️ `README-USER.md`
  - *Purpose:* يصف هذا الملف برنامج جداول بيانات EXELMJ، ويوفر دليلاً سريعاً للتثبيت والميزات والقيود، ويدعم فتح وحفظ ملفات Excel (xlsx).
  - *Last Modified:* 2026-07-17

- 🗂️ `cairo.tgz`
  - *Purpose:* Project file (.tgz)
  - *Last Modified:* 2026-08-13

- 🗂️ `electron-builder.yml`
  - *Purpose:* YAML config. Keys: appId, productName, electronDist, directories, files, win.
  - *Last Modified:* 2026-08-13

- 🗂️ `package-lock.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-09-07

- 🗂️ `package.json`
  - *Purpose:* Project manifest: exelmj v0.10.0 — EXELMJ — Excel-like desktop spreadsheet (Arabic/English). Dependencies: polygon-clipping.
  - *Last Modified:* 2026-09-25

- 🗂️ `tsconfig.json`
  - *Purpose:* TypeScript config. Target: ES2022, Module: ESNext.
  - *Last Modified:* 2026-07-17

- 🗂️ `vite.config.ts`
  - *Purpose:* Configures Vite for building and serving the application's frontend.
  - *Last Modified:* 2026-07-17

- 🗂️ `vite.web.config.ts`
  - *Purpose:* Vite config for the web edition (npm run dev:web / build:web / preview:web): root src/web, output dist/web, defines import.meta.env.VITE_WEB='1' (main.ts drops Design/Photo/Studio, modeToggle shows only Sheets/Documents) and VITE_APP_VERSION from package.json; a closeBundle plugin writes dist/web/sw.js from src/web/sw.js with a content-hash version and the full file list.
  - *Last Modified:* 2026-09-25

- 🗂️ `vitest.config.ts`
  - *Purpose:* Uses: vitest/config.
  - *Last Modified:* 2026-08-18

## 📁 backups

- 🗂️ `backups/src-2026-08-15-0140/charts/ChartFloat.tsx`
  - *Purpose:* Defines: bindChartManager, buildOption, ChartFloat. Uses: react, echarts, /chartManager, /chartTypes, ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/charts/chartDialog.ts`
  - *Purpose:* Defines: ChartDialog class. Methods: open(). Uses: univerjs/presets, /chartTypes, /chartManager, ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/charts/chartManager.ts`
  - *Purpose:* Defines: ChartManager class, FUniver type, ChartSeriesData type, FloatHandle type. Methods: getDef(), list(), addChart(), updateChart(), remove(). Uses: univerjs/presets, echarts, /chartTypes.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/charts/chartTypes.ts`
  - *Purpose:* Defines: ChartKind type, ChartDef type.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/aiBackground.ts`
  - *Purpose:* Illustrator/PDF background rendering for the design mode.  Modern .ai IS a PDF container (since Illustrator 9 the native format embeds a complete PDF; Illustrator's private data hides in /AIPrivateData streams every renderer ignores). So pdf.js renders .ai directly — each artboard is a page. The worker is bundled INLINE (blob worker) because packaged Electron loads over file:// where a module worker from a file URL is blocked.. Defines: ArtworkKind type, ArtworkDoc type, ExtractedText type, PageInfo type, ensureWorker. Methods: render(), extractText(), noPdfContent(), destroy(). Uses: pdfjs-dist, pdfjs-dist/build, /bidiRuns.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/align.ts`
  - *Purpose:* Align and distribute — the operations that turn a pile of objects into a layout, and the ones every design tool is judged on.  Two rules, both learned from tools that get them wrong:  1. ALIGNMENT MOVES OBJECTS, NEVER RESIZES THEM. "Align left" means put every left edge on the same x. A tool that stretched objects to match would be doing something the user did not ask for and cannot easily undo.  2. DISTRIBUTE SPACES THE GAPS, NOT THE CENTRES. Evenly spaced CENTRES look wrong the moment the objects differ in size — the gaps come out unequal, which is what the eye actually reads. Spacing the gaps is what "distribute" means to a designer, and it is why this is not a one-line average.  Pure: no DOM. Unit-tested in node.. Defines: AlignMode type, DistributeMode type, Positioned type, alignDeltas. Uses: /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/bidiRuns.ts`
  - *Purpose:* Bidi handling for pdf-lib output — the ONE gap fontkit leaves.  Proven on this machine (scratch probe, content-stream level): pdf-lib's fontkit applies full Arabic GSUB shaping AND reverses a pure-RTL line into visual order, so logical-order Arabic must be passed UNCHANGED. But it has no UAX#9: it flips the WHOLE line, so embedded LTR runs (digits, Latin) come out mirrored — «07717835312» rendered «21353871770». Pre-reversing ONLY those LTR runs cancels the flip exactly.. Defines: normalizeArabicText, lineIsRtl, toPdfVisual.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/centerline.ts`
  - *Purpose:* Centreline tracing — Illustrator's "strokes" mode (tracing/strokes + maxstrokeweight), our own implementation.  The difference matters for line art: OUTLINE tracing of a 3px pen stroke gives a long closed loop wrapping both sides of the line, so the "line" is really a very thin filled sliver. Editing it, re-colouring it or changing its weight is then hopeless. CENTRELINE tracing gives one open path down the middle of the stroke plus a width — a real line, exactly what a technical drawing or a signature should become.  Method: 1. THINNING (Zhang–Suen): erode the shape symmetrically until it is one pixel wide, without breaking it apart. Two sub-iterations per pass with complementary rules — that symmetry is what keeps the skeleton centred. 2. GRAPH: skeleton pixels become nodes; ends (1 neighbour) and junctions. Defines: Centerline type, CenterlineResult type, thin.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/compound.ts`
  - *Purpose:* Releasing a compound path — turning one traced blob into separately selectable, separately COLOURABLE shapes.  THE PROBLEM THIS SOLVES trace.ts emits one Shape per colour layer, and each of those carries every region of that colour as a single `d` with many subpaths. So a traced logo arrives as a handful of opaque blobs: the user can move a whole colour, and nothing else. "Recolour just this petal" has no handle to grab.  THE OBVIOUS FIX IS WRONG Splitting every subpath into its own shape turns a donut into a solid disc, because the inner ring stops being a hole and becomes a second filled circle. Holes are not separate regions; they are part of their parent.  So: group each subpath with the holes it contains, and emit one shape per. Defines: SubPath type, Region type, groupRegions. Uses: /path, /shapes.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/contextMenu.ts`
  - *Purpose:* What the right-click menu offers, and when each entry is live.  The LABELS and the HANDLERS stay in designApp — they need i18n and the document. What lives here is the decision: given the state of the selection, the clipboard and the history, which entries are enabled.  It is separate because "make sure they actually work" is a claim that has to be checkable, and an entry that is enabled when its action cannot run is the exact failure that makes a menu untrustworthy. Every rule below is pinned by a test. Everything an entry is allowed to look at.. Defines: MenuState type, MenuAction type, MenuItem type, MenuEntry type, contextMenu.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/curveFit.ts`
  - *Purpose:* Least-squares cubic Bézier fitting (Schneider's algorithm, Graphics Gems).  This is what separates a usable trace from a lumpy one. A pixel boundary is a staircase; routing a curve through the midpoint of every step — the cheap trick — turns each step into a bump, so a straight letter stroke comes out wavy. Fitting instead asks: what single cubic passes closest to ALL these points? The staircase averages out and the stroke comes back straight, while a genuine corner is preserved because the caller splits the run there first.  Pure maths, no DOM — unit-tested in node.. Defines: Pt type, Cubic type, normalize, bezierAt, chordLengths.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/designApp.ts`
  - *Purpose:* EXELMJ Design mode — open Illustrator (.ai), PDF and SVG artwork, write Arabic text over it naturally, re-edit those texts any time, and export.  Model: the artwork is a READ-ONLY background (canvas via pdf.js for ai/pdf, live shadow-DOM svg for svg). The user's text lives in overlay boxes (native contenteditable — full Arabic bidi/shaping/caret from Chromium), stored in PDF points and persisted to a sidecar <file>.exelmj.json so they stay editable forever. Exports produce NEW files (PDF with real vector text via pdf-lib, or PNG); the original artwork is never touched. For SVG, the file's OWN <text> elements are also editable in place and saved back.. Defines: ArtworkDoc type, ExtractedText type, PageInfo type, PageBoxes type, TextBox type. Uses: ./i18n, /aiBackground, /inpaint, /overlayModel, /trace.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/docSetup.ts`
  - *Purpose:* What a NEW document is: how big, in what unit, at what resolution, and for screen or for print.  The app's own unit is the PostScript POINT everywhere else, so this module exists to be the single place any other unit is converted — and to make the two conversions that are easy to get wrong impossible to get wrong here:  - a PIXEL has no fixed physical size. It only means something once a resolution is chosen, which is exactly why DPI belongs in this dialog rather than buried in the export settings; - a MILLIMETRE does, and it never depends on the resolution. Wiring mm through the DPI is the classic bug that makes a 300dpi A4 come out four times too big.  Pure: no DOM. Unit-tested in node.. Defines: Unit type, ColorMode type, DocSetup type, ptPerUnit, toPt.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/gradientFit.ts`
  - *Purpose:* Linear-gradient detection for traced regions (Illustrator's enableGradient / GradientFidelity, our own implementation).  Why it matters: quantisation slices a smooth ramp into flat bands, and the step between two bands is visible as a hard edge — the classic "posterised" trace. Fitting the ORIGINAL pixels of each region with a linear colour ramp and emitting that instead of one flat colour makes neighbouring bands meet at the same colour, so the banding dissolves without adding a single path.  The fit is least-squares in closed form (no iteration, no random seeding), so the same picture always produces the same gradient.  Pure maths, no DOM — unit-tested in node.. Defines: LinearGradient type, GradientFitOptions type, fitPlane.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/group.ts`
  - *Purpose:* Transforming a SELECTION rather than a single object.  The overlay draws eight grips and a rotation grip around a multi-selection, but nothing was listening: applyOverlayResize only knew how to move one object, so the grips were decoration and dragging them did nothing. A library icon arrives as several separate runs, which is precisely why "the icon cannot be enlarged" — there was no single object to resize.  The two operations are here, pure, because the mistakes they invite are arithmetic ones: mapping a member from the wrong reference box, or rotating each member in place so the arrangement never actually turns.. Defines: Box type, scaleInGroup, orbitInGroup, spinInGroup. Uses: /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/grouping.ts`
  - *Purpose:* Membership: which objects belong together, and what a click on one means.  A group here is a RECORD, not a container (see studio/model.ts). Nothing moves into it and nothing is nested inside it — the flat per-page arrays are untouched, so every renderer and exporter keeps working without knowing groups exist. All that changes is what a selection RESOLVES to.  Pure, and unit-tested in node: the mistakes this invites are set-arithmetic ones — a group left holding a deleted child, a selection that expands forever, two groups that should have merged and did not.. Defines: GroupList type, groupOf, resolveSelection, makeGroup, ungroup. Uses: ./studio.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/handles.ts`
  - *Purpose:* The selection overlay: eight resize grips, a rotate grip, four crop grips, and the smart guides drawn while something is being dragged.  One overlay serves BOTH shapes and images. Before this, images had their own single corner grip (`.dz-img-grip`) with its own drag code and shapes had no grips at all — two behaviours for the same gesture, and neither could rotate. Everything here works on a plain { x, y, w, h } box plus a rotation, so the caller only has to say what the selected object's box IS and what to do when it changes. The maths lives in transform.ts and is unit-tested in node; this file is the DOM half and deliberately holds no geometry of its own.. Defines: Box type, HandleId type, SnapGuides type, rotateCursor. Uses: /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/images.ts`
  - *Purpose:* Images/logos the user places over the artwork (design mode's «صورة» tool).  Same coordinate contract as text boxes and shapes: PDF POINTS from the page's TOP-LEFT. The pixels live in the sidecar as a data URL so the placement survives a re-open without depending on the source file still being there — the manager swaps a client logo once and the file travels with the design.  Only PNG and JPEG are accepted: those are the two formats pdf-lib can embed, so anything that lands here is guaranteed to survive the PDF export.. Defines: PlacedImage type, PageImages type, isEmbeddableImage, num, fitIntoPage.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/inpaint.ts`
  - *Purpose:* Cover patches that DISAPPEAR into the artwork.  A flat median-colored rectangle is invisible on a solid background and glaringly obvious on a gradient one (the manager's real files are gradient posters — "يصبح واضح انك وضعت شيء فوق الصورة"). So instead of one color we RECONSTRUCT the background across the covered area:  for every interior pixel, blend the horizontal interpolation between the ring pixels on its row with the vertical interpolation between the ring pixels on its column.  That reproduces a linear gradient in ANY direction almost exactly (each interpolation is already correct along its own axis), stays smooth across two-tone blends, and degrades to the plain average on a solid area — while costing one getImageData + a per-pixel loop.. Defines: CoverPatch type, Rect type, RGB type, Ring type, stripToRgb.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/isoContour.ts`
  - *Purpose:* Sub-pixel contour extraction (marching squares with linear interpolation).  Why this replaced walking the pixel lattice: a lattice walk can only put a boundary on an integer pixel edge, so every edge is a staircase and every anti-aliased or JPEG-softened pixel is forced to one side. Marching squares reads a CONTINUOUS field and places each crossing exactly where the field passes the threshold, so the boundary lands mid-way through the soft pixels — where the real edge is. That is worth roughly half a pixel everywhere, and it is what lets the curve fitter downstream produce a clean line instead of averaging a staircase.  Pure maths, no DOM — unit-tested in node. A closed loop of sub-pixel points, in PIXEL coordinates.. Defines: Loop type, isoContours.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/marquee.ts`
  - *Purpose:* Marquee selection: drag a rectangle over the canvas to select everything under it, then move the lot together.  The geometry is pure so the two decisions that matter can be tested without a canvas:  1. WHAT COUNTS AS SELECTED. Every serious editor uses INTERSECTION, not containment: a user who drags a band across a row of objects means the ones they swept over, not only the ones they fully enclosed. Requiring containment makes large objects nearly unselectable and is the single most common complaint about hand-rolled marquees.  2. WHAT THE HANDLES MEASURE. A multi-selection's box is the union of the ROTATED bounds of its members — using each member's unrotated box would draw a frame that visibly excludes artwork the user can see is selected.. Defines: Box type, Shape type, Selectable type, dragRect, intersects. Uses: /transform, /shapes, /images, /overlayModel.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/motion.ts`
  - *Purpose:* What happens when someone touches a thing.  The model, and only the model: a record of intent, with no idea that CSS exists. motionCss.ts turns it into a stylesheet, the panel edits it, and the canvas previews it — three consumers, one shape of data, and none of them able to invent a field the others do not know about.  It is a SIDE-TABLE, the same doctrine as groups and frames (studio/model.ts): interactions reference objects by id and nothing moves into them, so every renderer and exporter that knows nothing about motion still draws the right picture. A document that records no interaction serialises as version 3 exactly as it always did.  Pure: no DOM. Unit-tested in node.. Defines: Trigger type, MotionProp type, Change type, Easing type, Direction type.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/nodeEdit.ts`
  - *Purpose:* The node editor overlay: per-anchor grips and Bezier control handles for a selected path.  This is what closes the longest-standing gap in the design page — "traced paths cannot be re-coloured or node-edited, they can only be moved and deleted". The geometry all lives in path.ts (pure, node-tested); this file is the DOM half, deliberately shaped like handles.ts so the two overlays behave the same way under the hand.  The path being edited is in the shape's LOCAL pt space (0,0 at shape.x/y), so every coordinate here is converted through the shape origin exactly once, at the boundary. Mixing the two spaces is the classic bug in this kind of editor and the reason the conversion is confined to toLocal/toPage below.. Defines: NodeEditor class, Seg type, NodeEditCallbacks type, Grab type. Methods: onChange(), onCommit(), destroy(), open(). Uses: /path.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/outline.ts`
  - *Purpose:* Stroke → outline: turning a stroked run into a filled shape.  WHY IT MATTERS HERE Two callers need it. Icon authoring (M4) has to ship outlined paths, because a stroked icon scaled to 16px renders its stroke at whatever width the consumer's renderer decides, while an outlined one is exact at every size. And centreline traces (centerline.ts) come back as stroked runs down the middle of a pen stroke — outlining them is what makes them fillable, gradient-able and boolean-able like every other region.  WHY NOT RASTERISE The two popular libraries for this (svg-outline-stroke, oslllo/svg-fixer) both rasterise the stroke and re-trace the bitmap. A 1.5pt stroke rasterised at 16px and re-traced comes back as garbage, and one of them exact-pins a native image module that will not build on Electron 43. bezier-js works on. Defines: Seg type, SubPath type, LineCap type, LineJoin type, OutlineOpts type. Uses: bezier-js, /path.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/overlayModel.ts`
  - *Purpose:* The design overlay model: the text boxes the user lays over an AI/PDF/SVG background. Coordinates are PDF POINTS measured from the page's TOP-LEFT (screen-like; converted to PDF bottom-up space only at export), so boxes are zoom-independent and survive re-opens.  Persistence: a sidecar JSON next to the original file (<file>.exelmj.json), schema v2: boxes PER PAGE (artboard) — v1 held a single page and artboard navigation silently destroyed the other artboards' texts (review finding). The original artwork is NEVER modified.. Defines: PageShapes type, Shape type, PageImages type, PlacedImage type, StudioDoc type. Uses: /shapes, /images, ./studio.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/path.ts`
  - *Purpose:* The path kernel: ONE place every SVG path in the app is normalised, split into subpaths, read as nodes, and written back.  WHY A CHOKE POINT Paths reach us from four unrelated directions — the tracer (trace.ts), the Illustrator bridge, a pasted/imported SVG, and eventually the web picker — and each speaks a different dialect of the same grammar: relative commands, shorthand S/T, arcs, implicit repeats, exponent notation. Every consumer downstream (the node editor, the PDF content stream, the SVG exporter, the per-subpath recolour) would otherwise need to handle all of it. Instead everything funnels through normalize() here and comes out as absolute M / L / C / Z only. That is the single assumption that makes a node editor tractable at all.  Arcs specifically CANNOT survive a non-uniform scale — scaling an `A`. Defines: Seg type, SubPath type, normalize, parse. Uses: svgpath, /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/pdfOverlayExport.ts`
  - *Purpose:* Export the design composition: the ORIGINAL vector artwork (when it is a PDF/.ai) — or a rasterized SVG background — with the user's Arabic text boxes drawn on top as real PDF text.  Arabic correctness proven on this machine at content-stream level: pdf-lib+fontkit shape Arabic (GSUB init/medi/fina) and reverse pure-RTL lines by themselves — text must be passed in LOGICAL order, with ONLY the embedded LTR runs pre-reversed (bidiRuns.toPdfVisual).. Defines: PDFFont type, PDFPage type, Shape type, OverlayExportInput type, exportOverlayPdf. Methods: getFont(). Uses: pdf-lib, pdf-lib/fontkit, /bidiRuns, /overlayModel, /shapes.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/shapes.ts`
  - *Purpose:* Vector shapes the user draws over the artwork (design mode's "شكل" tools).  Same coordinate contract as the text boxes: PDF POINTS from the page's TOP-LEFT, so a shape is zoom-independent and survives re-opens. For rect and ellipse (x, y) is the top-left corner and (w, h) the size; for line and arrow (x, y) is the FIRST endpoint and (w, h) the SIGNED delta to the second, which is what lets a line be drawn in any of the four directions.  Geometry here is pure (no canvas, no DOM) precisely so it is unit-testable in node; the painting helpers take a context and only translate. 'path' is not drawn by hand — it is what the image tracer produces.. Defines: ShapeKind type, Shape type, PageShapes type, cleanGradient.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/svgDesign.ts`
  - *Purpose:* SVG artwork support for the design mode: faithful mounting + IN-PLACE text editing (the part .ai/PDF cannot offer) + valid re-serialization.  Rules learned from research (see PROJECT_MAP): - Parse with DOMParser('image/svg+xml') and mount inside a SHADOW ROOT: Illustrator's internal <style> uses generic class names (.st0/.cls-1) that would collide with the app and other files. innerHTML would mangle xlink:href namespaces — never use it. - Editing happens in an OVERLAY contenteditable (Chromium gives Arabic bidi/shaping/caret for free); SVG itself has no text editing. - Illustrator splits runs into kerning tspans with per-glyph x arrays — collapse to one tspan before writing the new string. - CSS classes beat presentation attributes: inline the computed font/fill into style attributes on first edit so later changes actually apply. - Illustrator writes PostScript font names (ArialMT, Cairo-Regular…): keep. Defines: names class, SvgTextTarget type, parseSvg, mountSvg, lengthToPx.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/trace.ts`
  - *Purpose:* Raster → vector tracing (the manager's «تحويل إلى SVG», Illustrator's Image Trace in spirit — our own implementation, no third-party tracer).  The pipeline, in four exact steps: 1. VARIANCE-CUT quantisation → a small deterministic palette (see buildPalette: a median cut splits by rank and loses a small logo on a big white page, so the split point is chosen by variance instead). 2. STACKED LAYERS (the Inkscape "stack scans" idea): colours are ordered biggest-first and layer i's region is "this colour plus every colour painted above it". Lower layers extend UNDERNEATH upper ones, so every boundary between two colours is traced exactly once and a seam between two independently fitted curves cannot exist — matching is structural, not a post-fix. 3. A SOFT MEMBERSHIP field per layer — 0.5 exactly where a pixel sits half-way between the layer's colours and the rest — then SUB-PIXEL. Defines: Cubic type, Pt type, LinearGradient type, Centerline type, TracedPath type. Uses: /curveFit, /isoContour, /gradientFit, /centerline.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/trace.worker.ts`
  - *Purpose:* / <reference lib="webworker" /> The worker end of the tracing protocol. See traceWorker.ts for the client and for why this exists at all.  This file deliberately contains no algorithm: it unpacks a message, calls the SAME traceImage() the synchronous path calls, and posts results back. That is what makes "output is byte-identical to the synchronous path" true by construction rather than by testing two implementations against each other.. Defines: TracedPath type, cannot. Uses: /trace, /traceWorker.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/traceWorker.ts`
  - *Purpose:* The tracing worker.  Tracing a 4000x3000 image runs for several seconds of pure computation on the renderer thread, and until now that froze the window: no repaint, no cancel, no progress. The pipeline in trace.ts is already PURE (no DOM, no canvas — that is why it unit-tests in node), so it moves into a Worker unchanged. Nothing about the algorithm changes; only who runs it.  The protocol is deliberately tiny and typed on both ends. Two rules make it safe: 1. Every message carries the JOB ID. A late result from a cancelled job must be droppable, or a slow trace finishing after the user started a new one silently overwrites the new artwork. 2. Pixels are TRANSFERRED, not copied. A 4000x3000 RGBA buffer is 48 MB; structured-cloning it would cost more than some traces.. Defines: TraceRequest type, CancelRequest type, WorkerRequest type, ProgressMessage type, DoneMessage type. Methods: cancel(). Uses: /trace.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/transform.ts`
  - *Purpose:* Resize / rotate / crop geometry for the design canvas.  Same coordinate contract as the rest of src/design: PDF POINTS from the page's TOP-LEFT. Everything here is PURE — no canvas, no DOM — precisely so it unit-tests in node like shapes.ts and images.ts do.  The one non-obvious piece is resizing a ROTATED box. Dragging the SE handle of a box rotated 30° must keep the NW corner nailed to the page while the box grows along its OWN axes. Doing that in page space produces the familiar "the shape swims away from the cursor" bug. The fix is to work in the box's LOCAL frame (rotate the pointer back by -rotation about the centre), resize there, then place the new centre so the anchor corner lands exactly where it already was. resizeRotated() below is that, and nothing else.. Defines: Box type, HandleId type, boxCenter, rotatePoint, toLocal. Uses: svgpath, /shapes.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/design/wordExport.ts`
  - *Purpose:* AI/PDF → editable WORD converter (the manager's client workflow: designs arrive as .ai, clients need .docx they can retype).  Recipe: the artwork page becomes a full-page image placed BEHIND the text (its own printed runs already wiped with sampled-background patches by the caller), and every detected text run becomes a Word PARAGRAPH FRAME — absolutely positioned at the same pt coordinates (Word frames use twips, 1pt = 20 twips) — so the document opens in Word looking like the design, with every line directly editable.. Defines: TextBox type, WordRun type, DesignWordInput type, buildDesignWord. Uses: docx, /overlayModel.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/doc/docController.ts`
  - *Purpose:* Defines: DocController class, FUniver type, PrintCell type, TemplateId type. Methods: newWorkbook(), setSheetRtl(). Uses: univerjs/presets, ./i18n, ./xlsx, ./univer, ./word.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/format/formatActions.ts`
  - *Purpose:* Fine-grained "professional" controls the manager asked for — every action wraps a VERIFIED Univer facade API or command id (checked against 0.25.1) and operates on the ACTIVE selection. Menu-driven from electron/menu.ts via main.ts dispatch. Includes the previously-impossible «بدون حدود» (border type 'none') plus row/column, size, hide/show, freeze and clear controls.. Defines: FormatActions class, BorderChoice type. Methods: setBorder(), mergeAll(), unmerge(), toggleWrap(). Uses: univerjs/presets, ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/i18n/ar.json`
  - *Purpose:* Internationalization translations — JSON configuration/data file
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/i18n/en.json`
  - *Purpose:* Internationalization translations — JSON configuration/data file
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/i18n/i18n.ts`
  - *Purpose:* Defines: Lang type, initI18n. Uses: /en.json, /ar.json.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/index.html`
  - *Purpose:* HTML page: EXELMJ.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/main.ts`
  - *Purpose:* Defines: Lang type, DocumentView type, BorderChoice type, boot. Uses: /i18n, /univer, /doc, /charts, /word.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/pivot/pivotDialog.ts`
  - *Purpose:* Defines: PivotDialog class. Methods: open(). Uses: univerjs/presets, /pivotTypes, /pivotManager, ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/pivot/pivotEngine.ts`
  - *Purpose:* Pure pivot computation — no Univer imports, fully unit-testable. Input: data rows (header row already sliced off by the caller). Output: a 2D grid ready to write into the target sheet: without a columns field:  ['', valueTitle] / [key, agg]… / [total, grand] with a columns field:     ['', …colKeys, total] / [key, …aggs, rowAgg]… / [total, …colAggs, grand] Empty combos stay null (Excel leaves them blank). Aggregations ignore non-numeric values except `count`, which counts every non-empty entry.. Defines: PivotSpec type, PivotLabels type, PivotCell type, aggregate, sortedKeys. Uses: /pivotTypes.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/pivot/pivotManager.ts`
  - *Purpose:* Pivot lifecycle: read the source range, compute via the pure engine, and write the result into a dedicated TARGET sheet (values + light styling — plain cells, so the sheet opens as-is in real Excel). Definitions live in memory here, ride snapshot.custom.exelmjPivots on save (→ _EXELMJ_META) and come back through importXlsx, so refresh keeps working after reopen.. Defines: PivotManager class, PivotCell type, FWorkbook type, FWorksheet type, PivotInput type. Methods: list(), serialize(), restore(), clear(), readHeaders(), addPivot(). Uses: univerjs/presets, univerjs/core, /pivotEngine, /pivotTypes, ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/pivot/pivotTypes.ts`
  - *Purpose:* App-native pivot tables (Univer's own pivot is Pro-only — forbidden). A PivotDef references its SOURCE data (sheet + A1 range whose first row is headers) and the TARGET sheet the computed table is written into. Field references are 0-based column offsets WITHIN the range, so renaming a header never breaks the definition.. Defines: PivotAgg type, PivotDef type.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/print/printHtml.ts`
  - *Purpose:* Builds a print-ready HTML document from sheet data (values + styles + merges + column widths), with native RTL flow for right-to-left sheets and the floating charts appended as images. Rendered in a hidden window by the main process for the system print dialog / PDF export.. Defines: PrintCell type, PrintPayload type, borderCss, styleToCss, escapeHtml. Uses: univerjs/core.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78ms-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/78ms-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/83pv-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/90ms-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/90ms-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/90msp-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/90msp-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/90pv-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/90pv-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Add-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Add-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Add-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Add-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-6.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-GB1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-GB1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-GB1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-GB1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-GB1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-GB1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-6.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Korea1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Korea1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Korea1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/B5pc-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/B5pc-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/CNS-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/CNS-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/CNS1-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/CNS1-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/CNS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/CNS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/ETHK-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/ETHK-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/ETen-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/ETen-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/ETenms-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/ETenms-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Ext-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Ext-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Ext-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Ext-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GB-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GB-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GB-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GB-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBK-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBK-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBK2K-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBK2K-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBKp-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBKp-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBT-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBT-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBT-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBT-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBTpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBTpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/GBpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKdla-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKdla-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKdlb-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKdlb-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKgccs-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKgccs-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKm314-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKm314-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKm471-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKm471-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKscs-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/HKscs-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Hankaku.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Hiragana.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSC-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSC-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSC-Johab-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSC-Johab-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSCms-UHC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSCms-UHC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSCpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/KSCpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Katakana.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/LICENSE`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/NWP-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/NWP-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/Roman.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniCNS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniGB-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/UniKS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/cmaps/WP-Symbol.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/iccs/CGATS001Compat-v2-micro.icc`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/iccs/LICENSE`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitDingbats.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitFixed.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitFixedBold.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitFixedItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitSerif.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitSerifBold.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitSerifItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/FoxitSymbol.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/LICENSE_FOXIT`
  - *Purpose:* Copyright 2014 PDFium Authors. All rights reserved.  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:  * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. * Neither the name of Google Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission..
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/standard_fonts/LICENSE_LIBERATION`
  - *Purpose:* Defines: of type.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/LICENSE_JBIG2`
  - *Purpose:* Copyright 2014 The PDFium Authors  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:  * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. * Neither the name of Google Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission..
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/LICENSE_OPENJPEG`
  - *Purpose:* The copyright in this software is being made available under the 2-clauses BSD License, included below. This software may be subject to other third party and contributor rights, including patent rights, and no such rights are granted under this license. Copyright (c) 2002-2014, Universite catholique de Louvain (UCL), Belgium Copyright (c) 2002-2014, Professor Benoit Macq Copyright (c) 2003-2014, Antonin Descampe Copyright (c) 2003-2009, Francois-Olivier Devaux Copyright (c) 2005, Herve Drolon, FreeImage Team Copyright (c) 2002-2003, Yannick Verschueren Copyright (c) 2001-2003, David Janssens Copyright (c) 2011-2012, Centre National d'Etudes Spatiales (CNES), France Copyright (c) 2012, CS Systemes d'Information, France.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/LICENSE_PDFJS_JBIG2`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/LICENSE_PDFJS_QCMS`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/LICENSE_QCMS`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/jbig2.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/jbig2_nowasm_fallback.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: EmscriptenEH class, EmscriptenSjLj class, ExitStatus class, ExceptionInfo class, JBig2.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/openjpeg.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/openjpeg_nowasm_fallback.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: EmscriptenEH class, EmscriptenSjLj class, ExitStatus class, OpenJPEG, instantiate.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/qcms_bg.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/quickjs-eval.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: G class, QuickJS, y, E, ba.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/public/pdfjs/wasm/quickjs-eval.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/browserPanel.ts`
  - *Purpose:* The mini-browser panel: an address bar, the three device pills, and the rectangle the native view is told to occupy.  THE ONE STRUCTURAL FACT that shapes this file: the WebContentsView is a NATIVE child of the window and paints ABOVE all renderer DOM. Nothing here can overlap it, and no CSS can put anything on top of it. So the panel is a frame around a HOLE — a placeholder div whose measured rectangle is sent to main on every layout change, and everything the user interacts with lives outside that rectangle.  A consequence worth stating: when the panel is hidden or scrolled out of view the native view must be told, or it goes on painting over whatever is now in that part of the window.. Defines: BrowserPanel class, Device type, BrowserPanelHost type. Methods: onPicked(), pickProjectFolder(), importLast(), setStatus(). Uses: ./i18n, /devices.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/bundle.ts`
  - *Purpose:* The ZIP handoff bundle.  One emitter, two audiences, kept in SEPARATE directories: - everything at the top level is for the consuming agent, and is enough on its own to rebuild the design without EXELMJ; - source/ is our own reload path, and the agent is told to ignore it. Mixing them is how a bundle ends up with two descriptions of the same thing that can disagree.  Determinism matters more than it looks: an export that differs byte-for-byte every time makes "what changed since last week" unanswerable. Entries are sorted, timestamps are fixed, and nothing reads the clock — the generation time is passed IN.. Defines: HandoffInput type, BundleFile type, bundleFiles. Uses: jszip, /htmlExport, /motionCss, ./design, /color.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/captureImport.ts`
  - *Purpose:* Turning a picked web element into canvas objects.  This is the bridge the whole picker exists for, and it is the place where a wrong answer is hardest to notice: the result LOOKS like a design either way. So two rules govern it.  1. CSS PIXELS ARE NOT POINTS. The web measures in px (1/96in); the canvas measures in pt (1/72in). Importing px as pt shrinks everything by exactly 25%, uniformly — which reads as a deliberately smaller design, not as a bug, and survives review.  2. NEVER INVENT. A transparent background is not black. An unreadable colour is not a colour. A child with no recorded box is not at (0,0). Anything that cannot be reproduced is REPORTED in `degraded` so the handoff can say so, rather than being filled in with something plausible.. Defines: TextBox type, Capture type, ImportResult type, ImportOptions type, pxToPt. Uses: ./design, /handoff.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/color/contrast.ts`
  - *Purpose:* Contrast — WCAG 2.x relative luminance, hand-rolled in ten lines.  WHY NOT APCA (the WCAG 3 draft algorithm, which is perceptually better) The whole APCA toolchain is legally unusable for a distributed product: `apca-w3` is published All Rights Reserved with patent(s) pending and a grant limited to "web content", and it depends on `colorparsley`, which is AGPL-3.0. That chain silently taints every popular tool built on it — Adobe's Leonardo, apcach, Huetone, Harmonizer. WCAG 2.x is the only contrast algorithm in this space that is both a published standard and unencumbered, and it is also the one accessibility law actually cites.  The formula is small enough that depending on anything for it would be the strange choice.  Pure maths. Unit-tested against the published W3C examples.. Defines: LCH type, ContrastVerdict type, relativeLuminance, contrastRatio, verdict. Uses: /oklab.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/color/extract.ts`
  - *Purpose:* "Extract the colours from this image" — with ZERO new dependencies.  EXELMJ already owns a strong quantiser: src/design/trace.ts builds a palette by variance-cut splitting (keep splitting while a cluster's per-pixel SSE is still > 360), refines it with a deterministic k-means seeded from that cut, and runs a rescue pass over the FULL image so a small-but-distinct colour — a thin rule, one gold seal — is not lost because it never appeared in the sample. That is better than what a general-purpose colour-extraction library would give us, and it is already unit-tested.  So this file adds the ONE thing the tracer does not care about: naming. Six anonymous hexes are not a palette; Dominant / Vibrant / Muted / Dark / Light / Accent is. The role scoring is node-vibrant's taxonomy, reimplemented in ~40 lines against our own OKLCH so it agrees with the rest of the system.. Defines: RGB type, LCH type, Role type, Swatch type, ExtractOptions type. Uses: ./.., /oklab, /scale.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/color/oklab.ts`
  - *Purpose:* OKLab / OKLCH and the sRGB gamut boundary.  Vendored from Björn Ottosson's public reference implementation of Oklab (https://bottosson.github.io/posts/oklab/ and .../gamutclipping/), which the author released into the public domain / MIT. Roughly 200 lines, one file, zero dependencies.  WHY THIS FILE EXISTS AT ALL, given culori is a dependency culori converts colours. It does not answer "for THIS hue and THIS lightness, what is the most saturated colour sRGB can actually show?" — and that question is the whole colour picker. compute_max_saturation() answers it in a fitted polynomial plus one Halley step, i.e. a handful of FLOPs, which is what lets the picker draw a live gamut boundary at 60fps on a 2D canvas with no solver in the loop. A binary search per pixel would not.. Defines: RGB type, Lab type, LCH type, srgbToLinear, linearToSrgb.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/color/scale.ts`
  - *Purpose:* Tonal scales, harmony, dark-mode derivation and colour-vision simulation.  The design goal for the scale generator is the one thing a design system actually needs and almost no generator delivers: **equal step index means equal lightness across every hue**. Get that and contrast stops being a per-pair check and becomes a system invariant — swapping brand-600 for red-600 anywhere cannot break a contrast requirement, because the two have the same lightness by construction. Miss it and every hue needs its own contrast audit forever.  So the ladder is a fixed list of OKLab lightnesses, shared by all hues, and only the chroma varies per hue (clamped to what sRGB can show at that lightness). That is the whole algorithm, and its simplicity is the point.. Defines: LCH type, Step type, Scale type, ScaleOptions type. Uses: /oklab.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/color/tokens.ts`
  - *Purpose:* Design tokens in and out — DTCG on disk, CSS custom properties for the web, and an Adobe Swatch Exchange file for Illustrator and Photoshop.  The on-disk shape is the W3C Design Tokens Community Group format ($value / $type / $description, groups by nesting), which is why StudioDoc.tokens is already spelled that way in src/studio/model.ts: export is then a pass-through with no renaming layer to drift out of sync.  .ase matters more than it looks. EXELMJ already has an Illustrator COM bridge, so a palette written as .ase round-trips natively into the two tools the user already has open — no copy-pasting hex codes.. Defines: Scale type, CssOptions type, scaleToGroup, isToken, resolveToken. Uses: ./model, /scale.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/colorPanel.ts`
  - *Purpose:* The colour panel: an OKLCH picker with a live gamut boundary, scale generation from one seed, contrast verdicts, extract-from-image, dark-mode derivation and token export.  WHY THE PICKER IS HAND-ROLLED Every framework-free picker worth using has a blocking flaw for this app. The one with real RTL support (Coloris) documents that there is only ONE instance — a shape inspector needs a FILL picker and a STROKE picker side by side, so that is a functional block, not a preference. And none of them draw the sRGB gamut boundary, which is the entire reason to pick in OKLCH: without it the user drags into colours the screen cannot show and silently gets something else back.  The boundary is cheap because oklab.ts answers "max chroma at this L and hue" in a fitted polynomial plus one Halley step, so it can be evaluated per pixel. Defines: ColorPanel class, LCH type, ContrastVerdict type, CVD type, Scale type. Methods: tokens(), onChange(), selectedImagePixels(), applyToSelection(), saveFile(). Uses: ./i18n, /color, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/devices.ts`
  - *Purpose:* The device catalogue behind the desktop / tablet / mobile switch.  WHY A DEVICE IS MORE THAN A WIDTH Making the preview narrower is not previewing a phone. A phone reports a device pixel ratio (so `2x` images and `image-set()` resolve differently), a touch-capable pointer (so `@media (pointer: coarse)` and `(hover: none)` match, which is what turns hover menus into tap menus), and a mobile user agent (which server-side and JS feature detection both key off). A viewport that lies about those three shows a desktop layout squeezed into a phone width — the exact bug the switch exists to catch.  The numbers are transcribed from Chromium's own emulated-device list (BSD-licensed) for the handful we ship, rather than vendoring the whole file.. Defines: the class, Device type.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/handoff.ts`
  - *Purpose:* The design handoff: one model, two encodings — a Markdown spec and a ZIP bundle manifest.  THE FAILURE MODE THIS IS DESIGNED AGAINST is confident silent wrongness: an agent produces output that is plausible, self-consistent, visually close and wrong, with nothing anywhere signalling that it is wrong. Points read as pixels give a uniform 33% scale error that reads as a design choice. A captured component with no per-node geometry gets invented flex values that still measure the right outer box. An LTR capture is faithfully rebuilt with `margin-left` in an Arabic-first product.  So the governing rule here is: AN ABSENT FACT MUST BE LOUDER THAN A WRONG ONE. Every field that could be guessed is either populated or explicitly marked unknown with the reason. A handoff that omits something and says so is correct; one that omits it silently is defective even if everything it does. Defines: PageShapes type, Shape type, HandoffInput type, Manifest type. Uses: ./design, /color, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/htmlExport.ts`
  - *Purpose:* The design as real HTML and CSS.  WHY THIS EXISTS The handoff bundle described the design — a Markdown spec, colour tokens, SVG assets, the source file. A description is not a page. Nothing could be opened in a browser, and nothing could carry an animation, because a CSS animation is a rule attached to an ELEMENT and there were no elements.  WHAT IT GUARANTEES - One element per object, with a STABLE class derived from its id. Motion rules are written against those classes (see motionCss.ts), so the two modules agree without either importing the other's output. - LOGICAL properties only (inset-inline-start, not left). The document is Arabic-first, and a page that hard-codes `left` mirrors wrongly the moment its direction flips — which is the whole reason the handoff. Defines: derived class, an class, cannot class, HtmlPage type, HtmlInput type. Uses: ./design, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/icon/export.ts`
  - *Purpose:* Icon export: SVG, PNG at any size, and a real multi-resolution Windows .ico.  The .ico writer is here rather than a dependency because every ICO generator on npm pulls in a native image module (sharp / jimp), and this app has to build on Electron 43 for Windows without a native toolchain. The format is small and fully specified, and we already have the PNGs.  ICO holds PNG entries directly (Vista+), which is what every modern tool emits and what Windows has read for two decades — so the writer is a header, a directory, and the PNG bytes we already produced.. Defines: IconPath type, SvgOptions type, xml, toSvg. Uses: /presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/icon/presets.ts`
  - *Purpose:* Icon-system presets — the published grid rules of the three sets worth following, transcribed as DATA rather than reimplemented as behaviour.  These numbers are the actual difference between "a small drawing" and "an icon". A 24dp Material icon lives inside a 20dp live area with 2dp of padding, its exterior corners are 2dp and its INTERIOR corners are square; Lucide strokes 2 at round cap and join with 2 units between elements; Octicons ships every glyph at BOTH 16 and 24 rather than scaling one to the other, because a 24px glyph shrunk to 16 loses its stroke alignment.  The four Material keyline shapes matter most: they are why a circular icon and a square icon in the same set look the same SIZE despite the circle being geometrically larger.. Defines: IconPreset type, Keyline type.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/icon/validate.ts`
  - *Purpose:* The pixel-fit validator — "will this icon still be crisp at 16px?"  WHY THIS IS THE FEATURE, not a nicety An icon is the one drawing whose final size is decided by someone else, and at 16px a half-pixel offset is a visible blur across the whole glyph. The rule is unintuitive: whether a coordinate should land on a whole pixel or on a half depends on the STROKE WIDTH's parity. A 1px stroke is centred on its path, so it covers a whole pixel only when its centreline sits at x.5; a 2px stroke covers two whole pixels only when its centreline sits at a whole number. Getting that backwards is why hand-drawn icons look soft while the same shape from a real icon set looks sharp.  The validator therefore reports, per target size, exactly which nodes are off and by how much — a light that says "amber" without naming the node is not actionable.. Defines: Seg type, Offender type, SizeReport type, IconReport type, integerScaleSizes. Uses: ./.., /presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/iconPanel.ts`
  - *Purpose:* The icon panel: a preset picker, a live preview strip, the pixel-fit validator, and the export row.  WHY THE PREVIEW STRIP IS THE FEATURE, not decoration: an icon is the one drawing whose final size is decided by somebody else. Drawing at 24 and shipping at 16 is the normal case, and the difference between a crisp glyph and a soft one is invisible at authoring size. The strip renders the same artwork at every target size on every commit, so the failure is visible while it is still cheap to fix.  The validator does the half of that the eye cannot: it names the node that is off the pixel grid, at which size, and by how much.. Defines: IconPanel class, IconPath type, IconPreset type, IconLibrary type, IconPanelHost type. Methods: iconPaths(), updatePathD(), makeIconArtboard(), currentPreset(), saveFile(), setStatus(). Uses: ./i18n, ./design, /icon.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/layout.ts`
  - *Purpose:* Auto-layout on the canvas — the flexbox subset a UI designer actually uses.  WHY WE IMPLEMENT IT RATHER THAN EMBED YOGA Yoga (and Taffy) are excellent and both are a WASM binary plus a loader, for a feature that needs one axis, a gap, padding, two alignment axes, wrapping and three sizing modes. That subset is ~200 lines and is EXACTLY testable against a real browser's flexbox, which is the oracle that matters. Shipping a WASM module into a lean offline app to avoid writing 200 tested lines is the wrong trade — and a wrong-but-embedded layout engine is harder to debug than a wrong-but-ours one.  WHAT IT IS NOT: this is not a CSS engine. No percentages, no min/max, no baseline alignment, no grid. Those are the things a canvas designer does not reach for, and each one that is missing is a thing that cannot be subtly wrong.. Defines: LayoutBox type, LayoutChild type, LayoutResult type, origin, layoutFrame. Uses: /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/layoutPanel.ts`
  - *Purpose:* The layout panel: wrap a selection into an auto-layout frame and edit it.  This is the tab that turns the canvas from a drawing surface into a UI tool. The engine is in layout.ts (pure, node-tested); this file is the inspector, and it applies the computed positions straight back onto the flat arrays — so PDF, SVG, PNG and Word export need to know nothing about frames.  That last point is the whole reason frames are a SIDE-TABLE rather than a node tree: layout resolves to absolute points, and every existing exporter keeps working untouched.. Defines: LayoutPanel class, LayoutPanelHost type. Methods: frames(), selectedFrame(), selectFrame(), wrapSelection(), applyLayout(), unwrap(). Uses: ./i18n, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/mcpHandlers.ts`
  - *Purpose:* The renderer half of the MCP surface: where a tool call meets the open document.  Everything here is a pure function of a DocumentView, so the whole tool surface is testable in node without Electron, a window, or a running app. designApp supplies the view; this file never touches the DOM.. Defines: HandoffInput type, DocumentView type, ToolResult type, of, runStudioTool. Methods: handoff(), placeComponent(), markDirty(), open(), setDevice(), screenshot(). Uses: /color, /handoff, /bundle, /template, /devices.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/model.ts`
  - *Purpose:* Defines: PageInteractions type, TokenRef type, PageKind type, FrameDirection type, FrameAlign type. Uses: ./design.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/motionCss.ts`
  - *Purpose:* The compiler: an interaction model in, a stylesheet out.  This is the piece written from scratch rather than imported. Nothing here depends on a runtime, a library or a build step — what comes out is CSS text that a browser already knows how to run, which is the only way the export can be opened on a machine with nothing installed.  WHAT IT KNOWS, AND WHAT IT REFUSES TO PRETEND Six triggers reach the browser with no script at all: hover, press, focus, appear, scroll, and — through a hidden checkbox — toggle. The checkbox has a real cost: CSS cannot set `aria-pressed`, so a screen reader is never told the button's state. `emitAria` therefore writes four lines of plain script to carry the state, and turning it off is a deliberate choice the caller makes, not a default it stumbles into.. Defines: Change type, Easing type, Interaction type, MotionProp type, springLinear. Uses: ./design, /htmlExport.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/motionPanel.ts`
  - *Purpose:* The panel where a motion is recorded without typing anything.  Four decisions and no keyboard: which object, what sets it off, what changes, and how fast. Everything else — the CSS, the keyframes, the checkbox a toggle needs, the script that carries its ARIA state — is derived, and the person recording never sees any of it.  The DOM half. Every decision it makes about what CSS to produce lives in motionCss.ts, and every rule about what a motion may contain lives in design/motion.ts; this file only asks the questions and shows the answers.. Defines: MotionPanel class, Change type, Easing type, Interaction type, MotionProp type. Methods: objects(), interactions(), save(), preview(), highlight(), setStatus(). Uses: ./i18n, ./design, /motionCss.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/template.ts`
  - *Purpose:* Templates and component instances.  A TEMPLATE is one self-contained JSON file, `*.exelmj-tpl.json`, holding one ComponentDef with its content inline. No database, no index to rebuild, no server: a template can be emailed, dropped in a folder, and used. That is the excalidraw-libraries model, and it is proven at scale precisely because it refuses to be clever.  An INSTANCE is a reference plus overrides. Editing the definition updates every instance; overriding a slot changes only that one. "Detach" expands an instance into ordinary objects and severs the link — the escape hatch that keeps the abstraction from ever being a trap.  Pure: no DOM, no filesystem. Unit-tested in node.. Defines: Shape type, PlacedImage type, TemplateFile type, Selection type, defFromSelection. Uses: ./design, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/studio/templatePanel.ts`
  - *Purpose:* The templates panel: save a selection, browse the library, place an instance, and move templates in and out as files.  A template is ONE self-contained JSON file (see template.ts). That decision shows up here: the library is a flat list with no index to rebuild, no database to migrate, and "import" is just reading a file somebody emailed.. Defines: TemplatePanel class, TemplatePanelHost type. Methods: templates(), hasSelection(), saveSelection(), place(), remove(), add(). Uses: ./i18n, /model, /template.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/templates/templates.ts`
  - *Purpose:* Built-in Arabic-first business templates (invoice, payroll, budget, project tracker). Pure snapshot builders — File > New from Template feeds these to DocController. Sheets default to RTL in Arabic mode.. Defines: TemplateId type, Row type, text, num, formula. Uses: univerjs/core, ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/univer/formulaBarFix.ts`
  - *Purpose:* EXELMJ formula-bar fix — in Univer 0.25.1 the formula bar is display-only until a cell edit session exists: clicking it cold moves DOM focus but every keystroke is dropped (verified live; Excel starts editing on that click). Dispatching `sheet.operation.set-cell-edit-visible` alone does NOT help — the editor bridge is never primed and input stays dead. The only cold-start path that opens a WORKING session with the cell content preserved is a real double-click on the cell, so we intercept the cold formula-bar click and replay a synthetic double-click on the ACTIVE cell (mirror-aware). Once a session is open the bar's native input routing works, so we step aside.. Defines: ActivePoint type, activeCellPoint, synthesizeDblClick. Methods: getCellRect(). Uses: univerjs/presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/univer/hijri.ts`
  - *Purpose:* Hijri (Umm al-Qura) calendar functions — a regional differentiator no free Excel alternative ships. Registered as custom formula functions: HIJRI(serial)      → "1447/01/15"  (yyyy/mm/dd, latin digits — the Hindi digits display toggle transliterates them on screen) HIJRITEXT(serial)  → "١٥ محرم ١٤٤٧" (long month name, Arabic) HIJRIDAY/HIJRIMONTH/HIJRIYEAR(serial) → numbers HIJRITODAY()       → today as HIJRI() Excel knows none of these, so the exporter writes their computed VALUES and stashes the formulas in _EXELMJ_META; reopening in EXELMJ restores them.. Defines: serialToDate, coerceNumber, hijriParts, hijriFromSerial, hijriTextFromSerial. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/univer/rtlAlign.ts`
  - *Purpose:* EXELMJ RTL alignment fix.  rtlMirror.ts fakes right-to-left sheets by flipping the whole grid host with CSS scaleX(-1) (Univer 0.25.1 ships no RTL renderer). The flip mirrors the COLUMN order — exactly what we want — but it ALSO mirrors where the content sits INSIDE each cell: a cell the file explicitly aligns RIGHT is painted at its right edge and the flip lands it on the visual LEFT. Reported by the manager against Google Sheets, whose RTL view keeps such cells hugging the right edge (his report .xlsx carries horizontal="right" on every cell).  Fix: on RTL sheets swap the EXPLICIT horizontal alignment (left ⇄ right) at RENDER time only, via the cell-content interceptor's `interceptorStyle` (Styles.getStyleByCell merges it over the cell's own style). After the flip every cell lands on the side the file asked for, and the toolbar's align buttons read correctly too. Cells with NO explicit alignment are left alone,. Defines: FUniver type, Univer type, CellLike type, CellLocation type, swapHAlign. Methods: intercept(). Uses: univerjs/presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/univer/rtlDropdown.ts`
  - *Purpose:* EXELMJ RTL data-validation dropdown.  Proven on the packaged app with two files identical except for the sheet's rightToLeft flag: with the flag OFF Univer's own list dropdown opens on the first click (literal lists AND range-sourced ones); with it ON it never opens at ANY point of the cell — although the chip is drawn, the rule is loaded and hovering it still switches the cursor to a pointer (so the rule, the widget and its hit-test are all fine). The cell-anchored popup layer works under the mirror too — the column filter menu opens correctly — so what breaks is Univer's pointer-down → show-dropdown path inside the flipped host.  Rather than fight the engine, RTL sheets get their own list: a plain DOM popup appended to <body>, i.e. OUTSIDE the mirrored host, so it is never flipped (the same rule the editor overlay follows). It opens on a click on a cell carrying a `list` rule and writes the picked value through the facade.. Defines: parseListOptions, rangeOptions, optionsForCell. Uses: univerjs/presets, /rtlMirror.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/univer/rtlEditor.ts`
  - *Purpose:* EXELMJ RTL cell-editing overlay.  Univer 0.25.1's doc canvas editor has NO Unicode Bidi Algorithm: its shaper (ArabicHandler) naively REVERSES each Arabic run and lays runs out left-to- right; `paragraph.direction` / `section.contentDirection` are stored but ignored by layout (verified in the engine source and by live pixel/x-probe). So typing Arabic — and especially MIXED Arabic+Latin+digits — inside a cell shows garbled, back-to-front, left-flowing text, even though the committed GRID (which draws each cell as one browser-bidi fillText) looks correct.  Fix: while an RTL sheet's TEXT cell is being edited, cover Univer's canvas editor with a native <textarea dir="auto"; unicode-bidi:plaintext>. The browser does full, correct bidi + Arabic shaping + caret + right-to-left flow during editing. On commit we write the plain LOGICAL string to the cell via the facade (which parses numbers and formulas), and the grid renders it.. Defines: rtlSheet, cellEditorCanvas, editorLogicalText, activeCell. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/univer/rtlMirror.ts`
  - *Purpose:* EXELMJ RTL Mirror — renderer-level right-to-left sheets (column A on the RIGHT), which upstream Univer 0.25.1 does not ship (its renderer ignores worksheet.rightToLeft; verified in code, release notes and by pixel probe).  Mechanism, proven piece-by-piece in live experiments: 1. CSS scaleX(-1) on the sheet render host: geometry, headers, selections and overlays all mirror. The browser maps pointer coordinates through CSS transforms automatically, so hit-testing keeps working un-remapped. 2. Canvas text counter-flip: fillText/strokeText mirror each run around its own CENTER (stays inside its cell box), so after the CSS flip text reads normally. Scoped to canvases INSIDE the host — the formula bar canvas lives outside and must stay untouched. 3. drawImage counter-flip for picture sources only (HTMLImageElement / ImageBitmap) so photos aren't mirror-imaged; canvas-to-canvas blits pass through untouched.. Defines: setHindiDigits, isRtlMirrorActive, findHost, inHost. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/univer/setup.ts`
  - *Purpose:* The only place Univer is configured. Registers the 8 free OSS presets. FORBIDDEN: preset-sheets-advanced / any @univerjs-pro package (license-gated, adds a watermark + export caps) — see PROJECT_MAP.md [TECH_STACK].. Defines: FUniver type, Univer type, setupUniver. Uses: univerjs/presets, ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/direction.ts`
  - *Purpose:* Per-paragraph direction for the word editor: an explicit `dir` attribute on paragraphs and headings (the attribute the docx exporter reads — explicit per-node dir is the pattern that survives serialization and maps 1:1 to w:bidi). The editor ROOT carries the document default dir; this attribute is only set when a paragraph deviates or was imported with a direction.. Defines: Commands type. Methods: addGlobalAttributes(), addCommands(). Uses: tiptap/core.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/dirtyMux.ts`
  - *Purpose:* Main keeps ONE global dirty flag (the close-guard input). Two renderer documents feed it now — the sheet workbook and the word document — so this mux ORs the two before talking to the bridge. DocController reports through reportSheetDirty; the word module through reportWordDirty.. Defines: push, reportSheetDirty, reportWordDirty, reportDesignDirty, isSheetDirty.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/docxExport.ts`
  - *Purpose:* EXELMJ docx exporter — TipTap JSON → .docx bytes via the `docx` library.  Arabic-correctness rules (verified against OOXML docs + docx#3419): - Every RTL paragraph gets BOTH `bidirectional: true` (w:bidi) AND an explicit `alignment` — bidirectional alone leaves text stuck LEFT in Word. - Physical editor alignment maps to LOGICAL jc: rtl+right → START, rtl+left → END (and mirrored for LTR), center/justify pass through. That round-trips with the importer without ever flipping sides. - Runs containing Arabic get `rightToLeft: true` (w:rtl), and bold/italic/ size are emitted with their complex-script mirrors (w:bCs/w:iCs/w:szCs) — without those Word applies the format to Latin text only. - Tables in an RTL document get `visuallyRightToLeft`.. Defines: TipTapNode type, alignForExport, dataUrlToBytes, textRunsFor. Uses: docx.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/docxImport.ts`
  - *Purpose:* EXELMJ docx importer — .docx bytes → HTML for the TipTap editor.  Written in-house (same precedent as src/xlsx/): the popular converters are unusable for Arabic — mammoth deliberately drops alignment, direction, fonts and colors (a right-aligned RTL paragraph comes out as a bare LTR <p>), and docx-preview is read-only. This importer keeps exactly what the editor models: paragraphs/headings with LOGICAL alignment + direction, run formatting (incl. the complex-script mirrors Word uses for Arabic), lists, tables, and embedded images.  OOXML bidi rules honored here (see PROJECT_MAP): - w:bidi (paragraph) flips paragraph geometry; w:jc start/end are LOGICAL: start = RIGHT in an RTL paragraph, LEFT in LTR. left/right/center are physical. We resolve to a physical text-align for display but keep dir as its own attribute, so exporting maps back to logical start/end losslessly.. Defines: DocxImportResult type, XNode type, ParaProps type, tagName, children. Uses: jszip, fast-xml-parser.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/icons.ts`
  - *Purpose:* Ribbon icons — Fluent UI System Icons (c) Microsoft Corporation, MIT license. Source: https://github.com/microsoft/fluentui-system-icons (@fluentui/svg-icons)..
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/modeToggle.ts`
  - *Purpose:* The mode switch the manager asked for: a rounded sliding pill, fixed at the window's top corner, flipping between the THREE tools — the sheet app (#app / Univer), the word app (#word-app / TipTap) and the design app (#design-app / artwork overlay). The knob slides with an eased transform; the active label is highlighted. Lives on <body>, outside the mirrored sheet host (house rule for anything interactive while RTL sheets are mirrored).. Defines: AppMode type, currentMode, initModeToggle, setMode. Uses: ./i18n.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/printDoc.ts`
  - *Purpose:* Print HTML for the word document: the editor's HTML wrapped in a standalone A4 page (real margins live in @page — body padding would only apply to the first page). Printed through the existing hidden-window 'print:html' channel with preferCSSPageSize so Chromium honors the @page block.. Defines: html type, buildDocPrintHtml.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/ribbon.ts`
  - *Purpose:* EXELMJ Word-mode ribbon — an in-house, RTL-first Word-style ribbon.  Own code throughout. The layout follows the classic ribbon PATTERN (tab row, grouped controls with a label strip, table hover-grid picker, status-bar zoom) which is a functional UI method, studied from open-source references (ONLYOFFICE/LibreOffice ribbons — looked at, never copied) — see PROJECT_MAP. Icons are Microsoft's Fluent UI System Icons (MIT) inlined in icons.ts. No Office assets, no trademarks.. Defines: RibbonActions type, RibbonHandles type, icon, buildRibbon. Methods: newDoc(), open(), save(), saveAs(), print(), exportPdf(). Uses: ./i18n, /icons.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/word/wordApp.ts`
  - *Purpose:* EXELMJ Word mode — a Word-like docx editor living beside the sheet app.  The editor is TipTap (ProseMirror): a native contenteditable, so the BROWSER does Arabic bidi/shaping/caret — the exact property Univer's canvas engine lacks (which is why the sheet side needed the whole rtlMirror apparatus). The word container sits OUTSIDE the mirrored sheet host and is never affected by it.  File I/O goes through the existing bridge: readFile/saveFile/saveFileAs handle raw bytes for any extension; printing reuses the hidden-window 'print:html' channel with @page A4 + preferCSSPageSize.. Defines: WordApp class, TipTapNode type, RibbonActions type. Methods: mount(). Uses: tiptap/core, tiptap/starter-kit, tiptap/extension-text-align, tiptap/extension-text-style, tiptap/extension-highlight.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/chartMeta.ts`
  - *Purpose:* EXELMJ metadata rides INSIDE the xlsx in a veryHidden sheet (single-file promise). v3 payload: charts + pivot definitions (sheets referenced by ORDER INDEX), the original Univer sheet ids (so id-keyed resources like protection survive a round trip), and passthrough resources Excel has no mapping for. Invisible in Excel's Unhide dialog.. Defines: ExcelJS type, StoredChart type, StoredPivot type, CustomFormulaRef type, ExelmjMeta type. Uses: exceljs, ./charts, ./pivot.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/csv.ts`
  - *Purpose:* Own CSV engine (exceljs's csv needs node streams — not browser-safe). Auto-detects the delimiter (, ; or tab — Arabic Excel locales often use ;), falls back to windows-1256 decoding for legacy Arabic files, and prepends a UTF-8 BOM on export so Excel opens Arabic text correctly.. Defines: detectDelimiter, parseCsv, decodeCsvBytes. Uses: univerjs/core, /styleMap.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/exportXlsx.ts`
  - *Purpose:* Univer IWorkbookData snapshot → xlsx bytes (exceljs). Sets fullCalcOnLoad so real Excel recalculates all formulas on open.. Defines: CustomFormulaRef type, resolveStyle, sanitizeSheetName, normalizeValue, setCellValue. Uses: exceljs, univerjs/core, /styleMap, /resourceMap, /chartMeta.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/fidelityShield.ts`
  - *Purpose:* The Fidelity Shield: parts of a foreign xlsx that our pipeline does not model (pivot tables, native Excel charts/drawings, VBA macros) are RE-INJECTED into the exported file at zip level, so "open in EXELMJ, edit a cell, save" never destroys them. Sheets are matched by NAME (robust to reordering; renaming a sheet drops its attached parts — documented).  Preserved: xl/vbaProject.bin (+ macroEnabled workbook content type), pivotTable/pivotCache part chains, per-sheet drawing chains (native charts, their rels and media). Skipped: slicers, a sheet whose exported version already has its own drawing (EXELMJ images added this session), media name collisions.. Defines: FidelityReport type, fidelityMerge. Uses: jszip, /zipUtils.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/importXlsx.ts`
  - *Purpose:* xlsx bytes (exceljs) → Univer IWorkbookData snapshot. Fidelity contract lives in PROJECT_MAP.md [ARCHITECTURE].. Defines: StylePool type, poolStyle, convertCellValue. Uses: exceljs, univerjs/core, /styleMap, /resourceMap, /notesParser.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/notesParser.ts`
  - *Purpose:* exceljs 4.4.0 WRITES cell notes (xl/comments*.xml + VML) but its reader never surfaces them back on cell.note (verified empirically). This module reads them straight from the xlsx zip.. Defines: ParsedNote type, parseNotesFromZip. Uses: jszip, /styleMap, /zipUtils.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/resourceMap.ts`
  - *Purpose:* Maps Univer plugin "resources" (filter / data validation / conditional formatting) to and from exceljs. Resource JSON shapes were captured from a live fWorkbook.save() on @univerjs 0.25.1 — see PROJECT_MAP.md.  Fidelity contract (v2a): - Filter: the autoFilter RANGE only (no per-column criteria). - Data validation: literal lists, RANGE-sourced lists, whole/decimal/date/ textLength with operators. Custom formulas are skipped. - Conditional formatting: highlightCell (number ops incl. between/notBetween + containsText), colorScale, dataBar, iconSet. - Notes: Excel legacy notes ↔ Univer note plugin (size/visibility defaults). - Images: floating images ↔ Univer drawing plugin (anchored at cell corner; in-cell pixel offsets are approximated on export).. Defines: ExcelJS type, UniverResource type, PlainRange type, UniverDvRule type, UniverCfRule type. Uses: exceljs, univerjs/core, /styleMap.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/styleMap.ts`
  - *Purpose:* Bidirectional style/geometry mapping between exceljs and Univer models. Numeric enum values mirror @univerjs/core@0.25.1 (exact-pinned), verified against the installed .d.ts files. They are mirrored locally so the converter (and the node test runner) never runtime-imports the engine.. Defines: ExcelJS type, values enum, mirrors enum, applyTint, excelColorToRgb. Uses: exceljs, univerjs/core.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-0140/xlsx/zipUtils.ts`
  - *Purpose:* Shared low-level helpers for reading xlsx zip internals (used by the notes parser and the fidelity shield).. Defines: JSZip type, Relationship type, SheetPart type, attr, unescapeXml. Uses: jszip.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/src-2026-08-15-2320/charts/ChartFloat.tsx`
  - *Purpose:* Defines: bindChartManager, buildOption, ChartFloat. Uses: react, echarts, /chartManager, /chartTypes, ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/charts/chartDialog.ts`
  - *Purpose:* Defines: ChartDialog class. Methods: open(). Uses: univerjs/presets, /chartTypes, /chartManager, ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/charts/chartManager.ts`
  - *Purpose:* Defines: ChartManager class, FUniver type, ChartSeriesData type, FloatHandle type. Methods: getDef(), list(), addChart(), updateChart(), remove(). Uses: univerjs/presets, echarts, /chartTypes.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/charts/chartTypes.ts`
  - *Purpose:* Defines: ChartKind type, ChartDef type.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/aiBackground.ts`
  - *Purpose:* Illustrator/PDF background rendering for the design mode.  Modern .ai IS a PDF container (since Illustrator 9 the native format embeds a complete PDF; Illustrator's private data hides in /AIPrivateData streams every renderer ignores). So pdf.js renders .ai directly — each artboard is a page. The worker is bundled INLINE (blob worker) because packaged Electron loads over file:// where a module worker from a file URL is blocked.. Defines: ArtworkKind type, ArtworkDoc type, ExtractedText type, PageInfo type, ensureWorker. Methods: render(), extractText(), noPdfContent(), destroy(). Uses: pdfjs-dist, pdfjs-dist/build, /bidiRuns.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/align.ts`
  - *Purpose:* Align and distribute — the operations that turn a pile of objects into a layout, and the ones every design tool is judged on.  Two rules, both learned from tools that get them wrong:  1. ALIGNMENT MOVES OBJECTS, NEVER RESIZES THEM. "Align left" means put every left edge on the same x. A tool that stretched objects to match would be doing something the user did not ask for and cannot easily undo.  2. DISTRIBUTE SPACES THE GAPS, NOT THE CENTRES. Evenly spaced CENTRES look wrong the moment the objects differ in size — the gaps come out unequal, which is what the eye actually reads. Spacing the gaps is what "distribute" means to a designer, and it is why this is not a one-line average.  Pure: no DOM. Unit-tested in node.. Defines: AlignMode type, DistributeMode type, Positioned type, alignDeltas. Uses: /transform.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/bidiRuns.ts`
  - *Purpose:* Bidi handling for pdf-lib output — the ONE gap fontkit leaves.  Proven on this machine (scratch probe, content-stream level): pdf-lib's fontkit applies full Arabic GSUB shaping AND reverses a pure-RTL line into visual order, so logical-order Arabic must be passed UNCHANGED. But it has no UAX#9: it flips the WHOLE line, so embedded LTR runs (digits, Latin) come out mirrored — «07717835312» rendered «21353871770». Pre-reversing ONLY those LTR runs cancels the flip exactly.. Defines: normalizeArabicText, lineIsRtl, toPdfVisual.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/centerline.ts`
  - *Purpose:* Centreline tracing — Illustrator's "strokes" mode (tracing/strokes + maxstrokeweight), our own implementation.  The difference matters for line art: OUTLINE tracing of a 3px pen stroke gives a long closed loop wrapping both sides of the line, so the "line" is really a very thin filled sliver. Editing it, re-colouring it or changing its weight is then hopeless. CENTRELINE tracing gives one open path down the middle of the stroke plus a width — a real line, exactly what a technical drawing or a signature should become.  Method: 1. THINNING (Zhang–Suen): erode the shape symmetrically until it is one pixel wide, without breaking it apart. Two sub-iterations per pass with complementary rules — that symmetry is what keeps the skeleton centred. 2. GRAPH: skeleton pixels become nodes; ends (1 neighbour) and junctions. Defines: Centerline type, CenterlineResult type, thin.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/compound.ts`
  - *Purpose:* Releasing a compound path — turning one traced blob into separately selectable, separately COLOURABLE shapes.  THE PROBLEM THIS SOLVES trace.ts emits one Shape per colour layer, and each of those carries every region of that colour as a single `d` with many subpaths. So a traced logo arrives as a handful of opaque blobs: the user can move a whole colour, and nothing else. "Recolour just this petal" has no handle to grab.  THE OBVIOUS FIX IS WRONG Splitting every subpath into its own shape turns a donut into a solid disc, because the inner ring stops being a hole and becomes a second filled circle. Holes are not separate regions; they are part of their parent.  So: group each subpath with the holes it contains, and emit one shape per. Defines: SubPath type, Region type, groupRegions. Uses: /path, /shapes.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/contextMenu.ts`
  - *Purpose:* What the right-click menu offers, and when each entry is live.  The LABELS and the HANDLERS stay in designApp — they need i18n and the document. What lives here is the decision: given the state of the selection, the clipboard and the history, which entries are enabled.  It is separate because "make sure they actually work" is a claim that has to be checkable, and an entry that is enabled when its action cannot run is the exact failure that makes a menu untrustworthy. Every rule below is pinned by a test. Everything an entry is allowed to look at.. Defines: MenuState type, MenuAction type, MenuItem type, MenuEntry type, contextMenu.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/curveFit.ts`
  - *Purpose:* Least-squares cubic Bézier fitting (Schneider's algorithm, Graphics Gems).  This is what separates a usable trace from a lumpy one. A pixel boundary is a staircase; routing a curve through the midpoint of every step — the cheap trick — turns each step into a bump, so a straight letter stroke comes out wavy. Fitting instead asks: what single cubic passes closest to ALL these points? The staircase averages out and the stroke comes back straight, while a genuine corner is preserved because the caller splits the run there first.  Pure maths, no DOM — unit-tested in node.. Defines: Pt type, Cubic type, normalize, bezierAt, chordLengths.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/designApp.ts`
  - *Purpose:* EXELMJ Design mode — open Illustrator (.ai), PDF and SVG artwork, write Arabic text over it naturally, re-edit those texts any time, and export.  Model: the artwork is a READ-ONLY background (canvas via pdf.js for ai/pdf, live shadow-DOM svg for svg). The user's text lives in overlay boxes (native contenteditable — full Arabic bidi/shaping/caret from Chromium), stored in PDF points and persisted to a sidecar <file>.exelmj.json so they stay editable forever. Exports produce NEW files (PDF with real vector text via pdf-lib, or PNG); the original artwork is never touched. For SVG, the file's OWN <text> elements are also editable in place and saved back.. Defines: ArtworkDoc type, ExtractedText type, PageInfo type, PageBoxes type, TextBox type. Uses: ./i18n, /aiBackground, /inpaint, /overlayModel, /trace.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/docSetup.ts`
  - *Purpose:* What a NEW document is: how big, in what unit, at what resolution, and for screen or for print.  The app's own unit is the PostScript POINT everywhere else, so this module exists to be the single place any other unit is converted — and to make the two conversions that are easy to get wrong impossible to get wrong here:  - a PIXEL has no fixed physical size. It only means something once a resolution is chosen, which is exactly why DPI belongs in this dialog rather than buried in the export settings; - a MILLIMETRE does, and it never depends on the resolution. Wiring mm through the DPI is the classic bug that makes a 300dpi A4 come out four times too big.  Pure: no DOM. Unit-tested in node.. Defines: Unit type, ColorMode type, DocSetup type, ptPerUnit, toPt.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/gradientFit.ts`
  - *Purpose:* Linear-gradient detection for traced regions (Illustrator's enableGradient / GradientFidelity, our own implementation).  Why it matters: quantisation slices a smooth ramp into flat bands, and the step between two bands is visible as a hard edge — the classic "posterised" trace. Fitting the ORIGINAL pixels of each region with a linear colour ramp and emitting that instead of one flat colour makes neighbouring bands meet at the same colour, so the banding dissolves without adding a single path.  The fit is least-squares in closed form (no iteration, no random seeding), so the same picture always produces the same gradient.  Pure maths, no DOM — unit-tested in node.. Defines: LinearGradient type, GradientFitOptions type, fitPlane.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/group.ts`
  - *Purpose:* Transforming a SELECTION rather than a single object.  The overlay draws eight grips and a rotation grip around a multi-selection, but nothing was listening: applyOverlayResize only knew how to move one object, so the grips were decoration and dragging them did nothing. A library icon arrives as several separate runs, which is precisely why "the icon cannot be enlarged" — there was no single object to resize.  The two operations are here, pure, because the mistakes they invite are arithmetic ones: mapping a member from the wrong reference box, or rotating each member in place so the arrangement never actually turns.. Defines: Box type, scaleInGroup, orbitInGroup, spinInGroup. Uses: /transform.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/grouping.ts`
  - *Purpose:* Membership: which objects belong together, and what a click on one means.  A group here is a RECORD, not a container (see studio/model.ts). Nothing moves into it and nothing is nested inside it — the flat per-page arrays are untouched, so every renderer and exporter keeps working without knowing groups exist. All that changes is what a selection RESOLVES to.  Pure, and unit-tested in node: the mistakes this invites are set-arithmetic ones — a group left holding a deleted child, a selection that expands forever, two groups that should have merged and did not.. Defines: GroupList type, groupOf, resolveSelection, makeGroup, ungroup. Uses: ./studio.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/handles.ts`
  - *Purpose:* The selection overlay: eight resize grips, a rotate grip, four crop grips, and the smart guides drawn while something is being dragged.  One overlay serves BOTH shapes and images. Before this, images had their own single corner grip (`.dz-img-grip`) with its own drag code and shapes had no grips at all — two behaviours for the same gesture, and neither could rotate. Everything here works on a plain { x, y, w, h } box plus a rotation, so the caller only has to say what the selected object's box IS and what to do when it changes. The maths lives in transform.ts and is unit-tested in node; this file is the DOM half and deliberately holds no geometry of its own.. Defines: Box type, HandleId type, SnapGuides type, rotateCursor. Uses: /transform.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/images.ts`
  - *Purpose:* Images/logos the user places over the artwork (design mode's «صورة» tool).  Same coordinate contract as text boxes and shapes: PDF POINTS from the page's TOP-LEFT. The pixels live in the sidecar as a data URL so the placement survives a re-open without depending on the source file still being there — the manager swaps a client logo once and the file travels with the design.  Only PNG and JPEG are accepted: those are the two formats pdf-lib can embed, so anything that lands here is guaranteed to survive the PDF export.. Defines: PlacedImage type, PageImages type, isEmbeddableImage, num, fitIntoPage.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/inpaint.ts`
  - *Purpose:* Cover patches that DISAPPEAR into the artwork.  A flat median-colored rectangle is invisible on a solid background and glaringly obvious on a gradient one (the manager's real files are gradient posters — "يصبح واضح انك وضعت شيء فوق الصورة"). So instead of one color we RECONSTRUCT the background across the covered area:  for every interior pixel, blend the horizontal interpolation between the ring pixels on its row with the vertical interpolation between the ring pixels on its column.  That reproduces a linear gradient in ANY direction almost exactly (each interpolation is already correct along its own axis), stays smooth across two-tone blends, and degrades to the plain average on a solid area — while costing one getImageData + a per-pixel loop.. Defines: CoverPatch type, Rect type, RGB type, Ring type, stripToRgb.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/isoContour.ts`
  - *Purpose:* Sub-pixel contour extraction (marching squares with linear interpolation).  Why this replaced walking the pixel lattice: a lattice walk can only put a boundary on an integer pixel edge, so every edge is a staircase and every anti-aliased or JPEG-softened pixel is forced to one side. Marching squares reads a CONTINUOUS field and places each crossing exactly where the field passes the threshold, so the boundary lands mid-way through the soft pixels — where the real edge is. That is worth roughly half a pixel everywhere, and it is what lets the curve fitter downstream produce a clean line instead of averaging a staircase.  Pure maths, no DOM — unit-tested in node. A closed loop of sub-pixel points, in PIXEL coordinates.. Defines: Loop type, isoContours.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/marquee.ts`
  - *Purpose:* Marquee selection: drag a rectangle over the canvas to select everything under it, then move the lot together.  The geometry is pure so the two decisions that matter can be tested without a canvas:  1. WHAT COUNTS AS SELECTED. Every serious editor uses INTERSECTION, not containment: a user who drags a band across a row of objects means the ones they swept over, not only the ones they fully enclosed. Requiring containment makes large objects nearly unselectable and is the single most common complaint about hand-rolled marquees.  2. WHAT THE HANDLES MEASURE. A multi-selection's box is the union of the ROTATED bounds of its members — using each member's unrotated box would draw a frame that visibly excludes artwork the user can see is selected.. Defines: Box type, Shape type, Selectable type, dragRect, intersects. Uses: /transform, /shapes, /images, /overlayModel.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/motion.ts`
  - *Purpose:* What happens when someone touches a thing.  The model, and only the model: a record of intent, with no idea that CSS exists. motionCss.ts turns it into a stylesheet, the panel edits it, and the canvas previews it — three consumers, one shape of data, and none of them able to invent a field the others do not know about.  It is a SIDE-TABLE, the same doctrine as groups and frames (studio/model.ts): interactions reference objects by id and nothing moves into them, so every renderer and exporter that knows nothing about motion still draws the right picture. A document that records no interaction serialises as version 3 exactly as it always did.  Pure: no DOM. Unit-tested in node.. Defines: Trigger type, MotionProp type, Stop type, Change type.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/motionPresets.ts`
  - *Purpose:* The one-press motions.  What actually makes Lordicon and its kind usable by somebody who does not program is not the engine — it is that "a bell that rings" is ONE press, not nine decisions. Each preset here is a fully-decided interaction body; the panel stamps it onto a new interaction and everything about it can still be edited afterwards, because it is made of the same fields as a hand-built one.  Two families, because they answer two different questions: hover  — what does it do when TOUCHED appear — how does it ARRIVE  Values are chosen against the references, not invented: swings decay (±12 → ∓10 → ±6 → 0) rather than tick like a metronome; idles are slow and shallow because they play forever and anything faster reads as a bug; and. Defines: PresetPatch type, IconPreset type. Uses: /motion.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/nodeEdit.ts`
  - *Purpose:* The node editor overlay: per-anchor grips and Bezier control handles for a selected path.  This is what closes the longest-standing gap in the design page — "traced paths cannot be re-coloured or node-edited, they can only be moved and deleted". The geometry all lives in path.ts (pure, node-tested); this file is the DOM half, deliberately shaped like handles.ts so the two overlays behave the same way under the hand.  The path being edited is in the shape's LOCAL pt space (0,0 at shape.x/y), so every coordinate here is converted through the shape origin exactly once, at the boundary. Mixing the two spaces is the classic bug in this kind of editor and the reason the conversion is confined to toLocal/toPage below.. Defines: NodeEditor class, Seg type, NodeEditCallbacks type, Grab type. Methods: onChange(), onCommit(), destroy(), open(). Uses: /path.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/outline.ts`
  - *Purpose:* Stroke → outline: turning a stroked run into a filled shape.  WHY IT MATTERS HERE Two callers need it. Icon authoring (M4) has to ship outlined paths, because a stroked icon scaled to 16px renders its stroke at whatever width the consumer's renderer decides, while an outlined one is exact at every size. And centreline traces (centerline.ts) come back as stroked runs down the middle of a pen stroke — outlining them is what makes them fillable, gradient-able and boolean-able like every other region.  WHY NOT RASTERISE The two popular libraries for this (svg-outline-stroke, oslllo/svg-fixer) both rasterise the stroke and re-trace the bitmap. A 1.5pt stroke rasterised at 16px and re-traced comes back as garbage, and one of them exact-pins a native image module that will not build on Electron 43. bezier-js works on. Defines: Seg type, SubPath type, LineCap type, LineJoin type, OutlineOpts type. Uses: bezier-js, /path.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/overlayModel.ts`
  - *Purpose:* The design overlay model: the text boxes the user lays over an AI/PDF/SVG background. Coordinates are PDF POINTS measured from the page's TOP-LEFT (screen-like; converted to PDF bottom-up space only at export), so boxes are zoom-independent and survive re-opens.  Persistence: a sidecar JSON next to the original file (<file>.exelmj.json), schema v2: boxes PER PAGE (artboard) — v1 held a single page and artboard navigation silently destroyed the other artboards' texts (review finding). The original artwork is NEVER modified.. Defines: PageShapes type, Shape type, PageImages type, PlacedImage type, StudioDoc type. Uses: /shapes, /images, ./studio.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/path.ts`
  - *Purpose:* The path kernel: ONE place every SVG path in the app is normalised, split into subpaths, read as nodes, and written back.  WHY A CHOKE POINT Paths reach us from four unrelated directions — the tracer (trace.ts), the Illustrator bridge, a pasted/imported SVG, and eventually the web picker — and each speaks a different dialect of the same grammar: relative commands, shorthand S/T, arcs, implicit repeats, exponent notation. Every consumer downstream (the node editor, the PDF content stream, the SVG exporter, the per-subpath recolour) would otherwise need to handle all of it. Instead everything funnels through normalize() here and comes out as absolute M / L / C / Z only. That is the single assumption that makes a node editor tractable at all.  Arcs specifically CANNOT survive a non-uniform scale — scaling an `A`. Defines: Seg type, SubPath type, normalize, parse. Uses: svgpath, /transform.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/pdfOverlayExport.ts`
  - *Purpose:* Export the design composition: the ORIGINAL vector artwork (when it is a PDF/.ai) — or a rasterized SVG background — with the user's Arabic text boxes drawn on top as real PDF text.  Arabic correctness proven on this machine at content-stream level: pdf-lib+fontkit shape Arabic (GSUB init/medi/fina) and reverse pure-RTL lines by themselves — text must be passed in LOGICAL order, with ONLY the embedded LTR runs pre-reversed (bidiRuns.toPdfVisual).. Defines: PDFFont type, PDFPage type, Shape type, OverlayExportInput type, exportOverlayPdf. Methods: getFont(). Uses: pdf-lib, pdf-lib/fontkit, /bidiRuns, /overlayModel, /shapes.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/shapes.ts`
  - *Purpose:* Vector shapes the user draws over the artwork (design mode's "شكل" tools).  Same coordinate contract as the text boxes: PDF POINTS from the page's TOP-LEFT, so a shape is zoom-independent and survives re-opens. For rect and ellipse (x, y) is the top-left corner and (w, h) the size; for line and arrow (x, y) is the FIRST endpoint and (w, h) the SIGNED delta to the second, which is what lets a line be drawn in any of the four directions.  Geometry here is pure (no canvas, no DOM) precisely so it is unit-testable in node; the painting helpers take a context and only translate. 'path' is not drawn by hand — it is what the image tracer produces.. Defines: ShapeKind type, Shape type, PageShapes type, cleanGradient.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/svgDesign.ts`
  - *Purpose:* SVG artwork support for the design mode: faithful mounting + IN-PLACE text editing (the part .ai/PDF cannot offer) + valid re-serialization.  Rules learned from research (see PROJECT_MAP): - Parse with DOMParser('image/svg+xml') and mount inside a SHADOW ROOT: Illustrator's internal <style> uses generic class names (.st0/.cls-1) that would collide with the app and other files. innerHTML would mangle xlink:href namespaces — never use it. - Editing happens in an OVERLAY contenteditable (Chromium gives Arabic bidi/shaping/caret for free); SVG itself has no text editing. - Illustrator splits runs into kerning tspans with per-glyph x arrays — collapse to one tspan before writing the new string. - CSS classes beat presentation attributes: inline the computed font/fill into style attributes on first edit so later changes actually apply. - Illustrator writes PostScript font names (ArialMT, Cairo-Regular…): keep. Defines: names class, SvgTextTarget type, parseSvg, mountSvg, lengthToPx.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/trace.ts`
  - *Purpose:* Raster → vector tracing (the manager's «تحويل إلى SVG», Illustrator's Image Trace in spirit — our own implementation, no third-party tracer).  The pipeline, in four exact steps: 1. VARIANCE-CUT quantisation → a small deterministic palette (see buildPalette: a median cut splits by rank and loses a small logo on a big white page, so the split point is chosen by variance instead). 2. STACKED LAYERS (the Inkscape "stack scans" idea): colours are ordered biggest-first and layer i's region is "this colour plus every colour painted above it". Lower layers extend UNDERNEATH upper ones, so every boundary between two colours is traced exactly once and a seam between two independently fitted curves cannot exist — matching is structural, not a post-fix. 3. A SOFT MEMBERSHIP field per layer — 0.5 exactly where a pixel sits half-way between the layer's colours and the rest — then SUB-PIXEL. Defines: Cubic type, Pt type, LinearGradient type, Centerline type, TracedPath type. Uses: /curveFit, /isoContour, /gradientFit, /centerline.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/trace.worker.ts`
  - *Purpose:* / <reference lib="webworker" /> The worker end of the tracing protocol. See traceWorker.ts for the client and for why this exists at all.  This file deliberately contains no algorithm: it unpacks a message, calls the SAME traceImage() the synchronous path calls, and posts results back. That is what makes "output is byte-identical to the synchronous path" true by construction rather than by testing two implementations against each other.. Defines: TracedPath type, cannot. Uses: /trace, /traceWorker.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/traceWorker.ts`
  - *Purpose:* The tracing worker.  Tracing a 4000x3000 image runs for several seconds of pure computation on the renderer thread, and until now that froze the window: no repaint, no cancel, no progress. The pipeline in trace.ts is already PURE (no DOM, no canvas — that is why it unit-tests in node), so it moves into a Worker unchanged. Nothing about the algorithm changes; only who runs it.  The protocol is deliberately tiny and typed on both ends. Two rules make it safe: 1. Every message carries the JOB ID. A late result from a cancelled job must be droppable, or a slow trace finishing after the user started a new one silently overwrites the new artwork. 2. Pixels are TRANSFERRED, not copied. A 4000x3000 RGBA buffer is 48 MB; structured-cloning it would cost more than some traces.. Defines: TraceRequest type, CancelRequest type, WorkerRequest type, ProgressMessage type, DoneMessage type. Methods: cancel(). Uses: /trace.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/transform.ts`
  - *Purpose:* Resize / rotate / crop geometry for the design canvas.  Same coordinate contract as the rest of src/design: PDF POINTS from the page's TOP-LEFT. Everything here is PURE — no canvas, no DOM — precisely so it unit-tests in node like shapes.ts and images.ts do.  The one non-obvious piece is resizing a ROTATED box. Dragging the SE handle of a box rotated 30° must keep the NW corner nailed to the page while the box grows along its OWN axes. Doing that in page space produces the familiar "the shape swims away from the cursor" bug. The fix is to work in the box's LOCAL frame (rotate the pointer back by -rotation about the centre), resize there, then place the new centre so the anchor corner lands exactly where it already was. resizeRotated() below is that, and nothing else.. Defines: Box type, HandleId type, boxCenter, rotatePoint, toLocal. Uses: svgpath, /shapes.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/design/wordExport.ts`
  - *Purpose:* AI/PDF → editable WORD converter (the manager's client workflow: designs arrive as .ai, clients need .docx they can retype).  Recipe: the artwork page becomes a full-page image placed BEHIND the text (its own printed runs already wiped with sampled-background patches by the caller), and every detected text run becomes a Word PARAGRAPH FRAME — absolutely positioned at the same pt coordinates (Word frames use twips, 1pt = 20 twips) — so the document opens in Word looking like the design, with every line directly editable.. Defines: TextBox type, WordRun type, DesignWordInput type, buildDesignWord. Uses: docx, /overlayModel.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/doc/docController.ts`
  - *Purpose:* Defines: DocController class, FUniver type, PrintCell type, TemplateId type. Methods: newWorkbook(), setSheetRtl(). Uses: univerjs/presets, ./i18n, ./xlsx, ./univer, ./word.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/format/formatActions.ts`
  - *Purpose:* Fine-grained "professional" controls the manager asked for — every action wraps a VERIFIED Univer facade API or command id (checked against 0.25.1) and operates on the ACTIVE selection. Menu-driven from electron/menu.ts via main.ts dispatch. Includes the previously-impossible «بدون حدود» (border type 'none') plus row/column, size, hide/show, freeze and clear controls.. Defines: FormatActions class, BorderChoice type. Methods: setBorder(), mergeAll(), unmerge(), toggleWrap(). Uses: univerjs/presets, ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/i18n/ar.json`
  - *Purpose:* Internationalization translations — JSON configuration/data file
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/i18n/en.json`
  - *Purpose:* Internationalization translations — JSON configuration/data file
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/i18n/i18n.ts`
  - *Purpose:* Defines: Lang type, initI18n. Uses: /en.json, /ar.json.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/index.html`
  - *Purpose:* HTML page: EXELMJ.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/main.ts`
  - *Purpose:* Defines: Lang type, DocumentView type, BorderChoice type, boot. Uses: /i18n, /univer, /doc, /charts, /word.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/pivot/pivotDialog.ts`
  - *Purpose:* Defines: PivotDialog class. Methods: open(). Uses: univerjs/presets, /pivotTypes, /pivotManager, ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/pivot/pivotEngine.ts`
  - *Purpose:* Pure pivot computation — no Univer imports, fully unit-testable. Input: data rows (header row already sliced off by the caller). Output: a 2D grid ready to write into the target sheet: without a columns field:  ['', valueTitle] / [key, agg]… / [total, grand] with a columns field:     ['', …colKeys, total] / [key, …aggs, rowAgg]… / [total, …colAggs, grand] Empty combos stay null (Excel leaves them blank). Aggregations ignore non-numeric values except `count`, which counts every non-empty entry.. Defines: PivotSpec type, PivotLabels type, PivotCell type, aggregate, sortedKeys. Uses: /pivotTypes.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/pivot/pivotManager.ts`
  - *Purpose:* Pivot lifecycle: read the source range, compute via the pure engine, and write the result into a dedicated TARGET sheet (values + light styling — plain cells, so the sheet opens as-is in real Excel). Definitions live in memory here, ride snapshot.custom.exelmjPivots on save (→ _EXELMJ_META) and come back through importXlsx, so refresh keeps working after reopen.. Defines: PivotManager class, PivotCell type, FWorkbook type, FWorksheet type, PivotInput type. Methods: list(), serialize(), restore(), clear(), readHeaders(), addPivot(). Uses: univerjs/presets, univerjs/core, /pivotEngine, /pivotTypes, ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/pivot/pivotTypes.ts`
  - *Purpose:* App-native pivot tables (Univer's own pivot is Pro-only — forbidden). A PivotDef references its SOURCE data (sheet + A1 range whose first row is headers) and the TARGET sheet the computed table is written into. Field references are 0-based column offsets WITHIN the range, so renaming a header never breaks the definition.. Defines: PivotAgg type, PivotDef type.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/print/printHtml.ts`
  - *Purpose:* Builds a print-ready HTML document from sheet data (values + styles + merges + column widths), with native RTL flow for right-to-left sheets and the floating charts appended as images. Rendered in a hidden window by the main process for the system print dialog / PDF export.. Defines: PrintCell type, PrintPayload type, borderCss, styleToCss, escapeHtml. Uses: univerjs/core.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78ms-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/78ms-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/83pv-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/90ms-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/90ms-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/90msp-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/90msp-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/90pv-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/90pv-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Add-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Add-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Add-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Add-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-6.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-GB1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-GB1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-GB1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-GB1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-GB1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-GB1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-6.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Korea1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Korea1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Korea1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/B5pc-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/B5pc-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/CNS-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/CNS-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/CNS1-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/CNS1-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/CNS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/CNS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/ETHK-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/ETHK-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/ETen-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/ETen-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/ETenms-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/ETenms-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Ext-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Ext-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Ext-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Ext-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GB-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GB-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GB-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GB-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBK-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBK-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBK2K-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBK2K-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBKp-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBKp-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBT-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBT-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBT-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBT-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBTpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBTpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/GBpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKdla-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKdla-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKdlb-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKdlb-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKgccs-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKgccs-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKm314-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKm314-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKm471-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKm471-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKscs-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/HKscs-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Hankaku.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Hiragana.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSC-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSC-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSC-Johab-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSC-Johab-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSCms-UHC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSCms-UHC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSCpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/KSCpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Katakana.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/LICENSE`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/NWP-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/NWP-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/Roman.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniCNS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniGB-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/UniKS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/cmaps/WP-Symbol.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/iccs/CGATS001Compat-v2-micro.icc`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/iccs/LICENSE`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitDingbats.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitFixed.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitFixedBold.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitFixedItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitSerif.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitSerifBold.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitSerifItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/FoxitSymbol.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/LICENSE_FOXIT`
  - *Purpose:* Copyright 2014 PDFium Authors. All rights reserved.  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:  * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. * Neither the name of Google Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission..
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/standard_fonts/LICENSE_LIBERATION`
  - *Purpose:* Defines: of type.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/LICENSE_JBIG2`
  - *Purpose:* Copyright 2014 The PDFium Authors  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:  * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. * Neither the name of Google Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission..
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/LICENSE_OPENJPEG`
  - *Purpose:* The copyright in this software is being made available under the 2-clauses BSD License, included below. This software may be subject to other third party and contributor rights, including patent rights, and no such rights are granted under this license. Copyright (c) 2002-2014, Universite catholique de Louvain (UCL), Belgium Copyright (c) 2002-2014, Professor Benoit Macq Copyright (c) 2003-2014, Antonin Descampe Copyright (c) 2003-2009, Francois-Olivier Devaux Copyright (c) 2005, Herve Drolon, FreeImage Team Copyright (c) 2002-2003, Yannick Verschueren Copyright (c) 2001-2003, David Janssens Copyright (c) 2011-2012, Centre National d'Etudes Spatiales (CNES), France Copyright (c) 2012, CS Systemes d'Information, France.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/LICENSE_PDFJS_JBIG2`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/LICENSE_PDFJS_QCMS`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/LICENSE_QCMS`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/jbig2.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/jbig2_nowasm_fallback.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: EmscriptenEH class, EmscriptenSjLj class, ExitStatus class, ExceptionInfo class, JBig2.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/openjpeg.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/openjpeg_nowasm_fallback.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: EmscriptenEH class, EmscriptenSjLj class, ExitStatus class, OpenJPEG, instantiate.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/qcms_bg.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/quickjs-eval.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: G class, QuickJS, y, E, ba.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/public/pdfjs/wasm/quickjs-eval.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/browserPanel.ts`
  - *Purpose:* The mini-browser panel: an address bar, the three device pills, and the rectangle the native view is told to occupy.  THE ONE STRUCTURAL FACT that shapes this file: the WebContentsView is a NATIVE child of the window and paints ABOVE all renderer DOM. Nothing here can overlap it, and no CSS can put anything on top of it. So the panel is a frame around a HOLE — a placeholder div whose measured rectangle is sent to main on every layout change, and everything the user interacts with lives outside that rectangle.  A consequence worth stating: when the panel is hidden or scrolled out of view the native view must be told, or it goes on painting over whatever is now in that part of the window.. Defines: BrowserPanel class, Device type, BrowserPanelHost type. Methods: onPicked(), pickProjectFolder(), importLast(), setStatus(). Uses: ./i18n, /devices.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/bundle.ts`
  - *Purpose:* The ZIP handoff bundle.  One emitter, two audiences, kept in SEPARATE directories: - everything at the top level is for the consuming agent, and is enough on its own to rebuild the design without EXELMJ; - source/ is our own reload path, and the agent is told to ignore it. Mixing them is how a bundle ends up with two descriptions of the same thing that can disagree.  Determinism matters more than it looks: an export that differs byte-for-byte every time makes "what changed since last week" unanswerable. Entries are sorted, timestamps are fixed, and nothing reads the clock — the generation time is passed IN.. Defines: HandoffInput type, BundleFile type, bundleFiles. Uses: jszip, /htmlExport, /motionCss, ./design, /color.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/captureImport.ts`
  - *Purpose:* Turning a picked web element into canvas objects.  This is the bridge the whole picker exists for, and it is the place where a wrong answer is hardest to notice: the result LOOKS like a design either way. So two rules govern it.  1. CSS PIXELS ARE NOT POINTS. The web measures in px (1/96in); the canvas measures in pt (1/72in). Importing px as pt shrinks everything by exactly 25%, uniformly — which reads as a deliberately smaller design, not as a bug, and survives review.  2. NEVER INVENT. A transparent background is not black. An unreadable colour is not a colour. A child with no recorded box is not at (0,0). Anything that cannot be reproduced is REPORTED in `degraded` so the handoff can say so, rather than being filled in with something plausible.. Defines: TextBox type, Capture type, ImportResult type, ImportOptions type, pxToPt. Uses: ./design, /handoff.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/color/contrast.ts`
  - *Purpose:* Contrast — WCAG 2.x relative luminance, hand-rolled in ten lines.  WHY NOT APCA (the WCAG 3 draft algorithm, which is perceptually better) The whole APCA toolchain is legally unusable for a distributed product: `apca-w3` is published All Rights Reserved with patent(s) pending and a grant limited to "web content", and it depends on `colorparsley`, which is AGPL-3.0. That chain silently taints every popular tool built on it — Adobe's Leonardo, apcach, Huetone, Harmonizer. WCAG 2.x is the only contrast algorithm in this space that is both a published standard and unencumbered, and it is also the one accessibility law actually cites.  The formula is small enough that depending on anything for it would be the strange choice.  Pure maths. Unit-tested against the published W3C examples.. Defines: LCH type, ContrastVerdict type, relativeLuminance, contrastRatio, verdict. Uses: /oklab.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/color/extract.ts`
  - *Purpose:* "Extract the colours from this image" — with ZERO new dependencies.  EXELMJ already owns a strong quantiser: src/design/trace.ts builds a palette by variance-cut splitting (keep splitting while a cluster's per-pixel SSE is still > 360), refines it with a deterministic k-means seeded from that cut, and runs a rescue pass over the FULL image so a small-but-distinct colour — a thin rule, one gold seal — is not lost because it never appeared in the sample. That is better than what a general-purpose colour-extraction library would give us, and it is already unit-tested.  So this file adds the ONE thing the tracer does not care about: naming. Six anonymous hexes are not a palette; Dominant / Vibrant / Muted / Dark / Light / Accent is. The role scoring is node-vibrant's taxonomy, reimplemented in ~40 lines against our own OKLCH so it agrees with the rest of the system.. Defines: RGB type, LCH type, Role type, Swatch type, ExtractOptions type. Uses: ./.., /oklab, /scale.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/color/oklab.ts`
  - *Purpose:* OKLab / OKLCH and the sRGB gamut boundary.  Vendored from Björn Ottosson's public reference implementation of Oklab (https://bottosson.github.io/posts/oklab/ and .../gamutclipping/), which the author released into the public domain / MIT. Roughly 200 lines, one file, zero dependencies.  WHY THIS FILE EXISTS AT ALL, given culori is a dependency culori converts colours. It does not answer "for THIS hue and THIS lightness, what is the most saturated colour sRGB can actually show?" — and that question is the whole colour picker. compute_max_saturation() answers it in a fitted polynomial plus one Halley step, i.e. a handful of FLOPs, which is what lets the picker draw a live gamut boundary at 60fps on a 2D canvas with no solver in the loop. A binary search per pixel would not.. Defines: RGB type, Lab type, LCH type, srgbToLinear, linearToSrgb.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/color/scale.ts`
  - *Purpose:* Tonal scales, harmony, dark-mode derivation and colour-vision simulation.  The design goal for the scale generator is the one thing a design system actually needs and almost no generator delivers: **equal step index means equal lightness across every hue**. Get that and contrast stops being a per-pair check and becomes a system invariant — swapping brand-600 for red-600 anywhere cannot break a contrast requirement, because the two have the same lightness by construction. Miss it and every hue needs its own contrast audit forever.  So the ladder is a fixed list of OKLab lightnesses, shared by all hues, and only the chroma varies per hue (clamped to what sRGB can show at that lightness). That is the whole algorithm, and its simplicity is the point.. Defines: LCH type, Step type, Scale type, ScaleOptions type. Uses: /oklab.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/color/tokens.ts`
  - *Purpose:* Design tokens in and out — DTCG on disk, CSS custom properties for the web, and an Adobe Swatch Exchange file for Illustrator and Photoshop.  The on-disk shape is the W3C Design Tokens Community Group format ($value / $type / $description, groups by nesting), which is why StudioDoc.tokens is already spelled that way in src/studio/model.ts: export is then a pass-through with no renaming layer to drift out of sync.  .ase matters more than it looks. EXELMJ already has an Illustrator COM bridge, so a palette written as .ase round-trips natively into the two tools the user already has open — no copy-pasting hex codes.. Defines: Scale type, CssOptions type, scaleToGroup, isToken, resolveToken. Uses: ./model, /scale.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/colorPanel.ts`
  - *Purpose:* The colour panel: an OKLCH picker with a live gamut boundary, scale generation from one seed, contrast verdicts, extract-from-image, dark-mode derivation and token export.  WHY THE PICKER IS HAND-ROLLED Every framework-free picker worth using has a blocking flaw for this app. The one with real RTL support (Coloris) documents that there is only ONE instance — a shape inspector needs a FILL picker and a STROKE picker side by side, so that is a functional block, not a preference. And none of them draw the sRGB gamut boundary, which is the entire reason to pick in OKLCH: without it the user drags into colours the screen cannot show and silently gets something else back.  The boundary is cheap because oklab.ts answers "max chroma at this L and hue" in a fitted polynomial plus one Halley step, so it can be evaluated per pixel. Defines: ColorPanel class, LCH type, ContrastVerdict type, CVD type, Scale type. Methods: tokens(), onChange(), selectedImagePixels(), applyToSelection(), saveFile(). Uses: ./i18n, /color, /model.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/devices.ts`
  - *Purpose:* The device catalogue behind the desktop / tablet / mobile switch.  WHY A DEVICE IS MORE THAN A WIDTH Making the preview narrower is not previewing a phone. A phone reports a device pixel ratio (so `2x` images and `image-set()` resolve differently), a touch-capable pointer (so `@media (pointer: coarse)` and `(hover: none)` match, which is what turns hover menus into tap menus), and a mobile user agent (which server-side and JS feature detection both key off). A viewport that lies about those three shows a desktop layout squeezed into a phone width — the exact bug the switch exists to catch.  The numbers are transcribed from Chromium's own emulated-device list (BSD-licensed) for the handful we ship, rather than vendoring the whole file.. Defines: the class, Device type.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/handoff.ts`
  - *Purpose:* The design handoff: one model, two encodings — a Markdown spec and a ZIP bundle manifest.  THE FAILURE MODE THIS IS DESIGNED AGAINST is confident silent wrongness: an agent produces output that is plausible, self-consistent, visually close and wrong, with nothing anywhere signalling that it is wrong. Points read as pixels give a uniform 33% scale error that reads as a design choice. A captured component with no per-node geometry gets invented flex values that still measure the right outer box. An LTR capture is faithfully rebuilt with `margin-left` in an Arabic-first product.  So the governing rule here is: AN ABSENT FACT MUST BE LOUDER THAN A WRONG ONE. Every field that could be guessed is either populated or explicitly marked unknown with the reason. A handoff that omits something and says so is correct; one that omits it silently is defective even if everything it does. Defines: PageShapes type, Shape type, HandoffInput type, Manifest type. Uses: ./design, /color, /model.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/htmlExport.ts`
  - *Purpose:* The design as real HTML and CSS.  WHY THIS EXISTS The handoff bundle described the design — a Markdown spec, colour tokens, SVG assets, the source file. A description is not a page. Nothing could be opened in a browser, and nothing could carry an animation, because a CSS animation is a rule attached to an ELEMENT and there were no elements.  WHAT IT GUARANTEES - One element per object, with a STABLE class derived from its id. Motion rules are written against those classes (see motionCss.ts), so the two modules agree without either importing the other's output. - LOGICAL properties only (inset-inline-start, not left). The document is Arabic-first, and a page that hard-codes `left` mirrors wrongly the moment its direction flips — which is the whole reason the handoff. Defines: derived class, an class, cannot class, HtmlPage type, HtmlInput type. Uses: ./design, /model.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/icon/export.ts`
  - *Purpose:* Icon export: SVG, PNG at any size, and a real multi-resolution Windows .ico.  The .ico writer is here rather than a dependency because every ICO generator on npm pulls in a native image module (sharp / jimp), and this app has to build on Electron 43 for Windows without a native toolchain. The format is small and fully specified, and we already have the PNGs.  ICO holds PNG entries directly (Vista+), which is what every modern tool emits and what Windows has read for two decades — so the writer is a header, a directory, and the PNG bytes we already produced.. Defines: IconPath type, SvgOptions type, xml, toSvg. Uses: /presets.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/icon/presets.ts`
  - *Purpose:* Icon-system presets — the published grid rules of the three sets worth following, transcribed as DATA rather than reimplemented as behaviour.  These numbers are the actual difference between "a small drawing" and "an icon". A 24dp Material icon lives inside a 20dp live area with 2dp of padding, its exterior corners are 2dp and its INTERIOR corners are square; Lucide strokes 2 at round cap and join with 2 units between elements; Octicons ships every glyph at BOTH 16 and 24 rather than scaling one to the other, because a 24px glyph shrunk to 16 loses its stroke alignment.  The four Material keyline shapes matter most: they are why a circular icon and a square icon in the same set look the same SIZE despite the circle being geometrically larger.. Defines: IconPreset type, Keyline type.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/icon/validate.ts`
  - *Purpose:* The pixel-fit validator — "will this icon still be crisp at 16px?"  WHY THIS IS THE FEATURE, not a nicety An icon is the one drawing whose final size is decided by someone else, and at 16px a half-pixel offset is a visible blur across the whole glyph. The rule is unintuitive: whether a coordinate should land on a whole pixel or on a half depends on the STROKE WIDTH's parity. A 1px stroke is centred on its path, so it covers a whole pixel only when its centreline sits at x.5; a 2px stroke covers two whole pixels only when its centreline sits at a whole number. Getting that backwards is why hand-drawn icons look soft while the same shape from a real icon set looks sharp.  The validator therefore reports, per target size, exactly which nodes are off and by how much — a light that says "amber" without naming the node is not actionable.. Defines: Seg type, Offender type, SizeReport type, IconReport type, integerScaleSizes. Uses: ./.., /presets.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/iconPanel.ts`
  - *Purpose:* The icon panel: a preset picker, a live preview strip, the pixel-fit validator, and the export row.  WHY THE PREVIEW STRIP IS THE FEATURE, not decoration: an icon is the one drawing whose final size is decided by somebody else. Drawing at 24 and shipping at 16 is the normal case, and the difference between a crisp glyph and a soft one is invisible at authoring size. The strip renders the same artwork at every target size on every commit, so the failure is visible while it is still cheap to fix.  The validator does the half of that the eye cannot: it names the node that is off the pixel grid, at which size, and by how much.. Defines: IconPanel class, IconPath type, IconPreset type, IconLibrary type, IconPanelHost type. Methods: iconPaths(), updatePathD(), makeIconArtboard(), currentPreset(), saveFile(), setStatus(). Uses: ./i18n, ./design, /icon.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/layout.ts`
  - *Purpose:* Auto-layout on the canvas — the flexbox subset a UI designer actually uses.  WHY WE IMPLEMENT IT RATHER THAN EMBED YOGA Yoga (and Taffy) are excellent and both are a WASM binary plus a loader, for a feature that needs one axis, a gap, padding, two alignment axes, wrapping and three sizing modes. That subset is ~200 lines and is EXACTLY testable against a real browser's flexbox, which is the oracle that matters. Shipping a WASM module into a lean offline app to avoid writing 200 tested lines is the wrong trade — and a wrong-but-embedded layout engine is harder to debug than a wrong-but-ours one.  WHAT IT IS NOT: this is not a CSS engine. No percentages, no min/max, no baseline alignment, no grid. Those are the things a canvas designer does not reach for, and each one that is missing is a thing that cannot be subtly wrong.. Defines: LayoutBox type, LayoutChild type, LayoutResult type, origin, layoutFrame. Uses: /model.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/layoutPanel.ts`
  - *Purpose:* The layout panel: wrap a selection into an auto-layout frame and edit it.  This is the tab that turns the canvas from a drawing surface into a UI tool. The engine is in layout.ts (pure, node-tested); this file is the inspector, and it applies the computed positions straight back onto the flat arrays — so PDF, SVG, PNG and Word export need to know nothing about frames.  That last point is the whole reason frames are a SIDE-TABLE rather than a node tree: layout resolves to absolute points, and every existing exporter keeps working untouched.. Defines: LayoutPanel class, LayoutPanelHost type. Methods: frames(), selectedFrame(), selectFrame(), wrapSelection(), applyLayout(), unwrap(). Uses: ./i18n, /model.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/mcpHandlers.ts`
  - *Purpose:* The renderer half of the MCP surface: where a tool call meets the open document.  Everything here is a pure function of a DocumentView, so the whole tool surface is testable in node without Electron, a window, or a running app. designApp supplies the view; this file never touches the DOM.. Defines: HandoffInput type, DocumentView type, ToolResult type, of, runStudioTool. Methods: handoff(), placeComponent(), markDirty(), open(), setDevice(), screenshot(). Uses: /color, /handoff, /bundle, /template, /devices.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/model.ts`
  - *Purpose:* Defines: PageInteractions type, TokenRef type, PageKind type, FrameDirection type, FrameAlign type. Uses: ./design.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/motionCss.ts`
  - *Purpose:* The compiler: an interaction model in, a stylesheet out.  This is the piece written from scratch rather than imported. Nothing here depends on a runtime, a library or a build step — what comes out is CSS text that a browser already knows how to run, which is the only way the export can be opened on a machine with nothing installed.  WHAT IT KNOWS, AND WHAT IT REFUSES TO PRETEND Six triggers reach the browser with no script at all: hover, press, focus, appear, scroll, and — through a hidden checkbox — toggle. The checkbox has a real cost: CSS cannot set `aria-pressed`, so a screen reader is never told the button's state. `emitAria` therefore writes four lines of plain script to carry the state, and turning it off is a deliberate choice the caller makes, not a default it stumbles into.. Defines: Change type, Easing type, Interaction type, MotionProp type, MarkupInject type. Uses: ./design, /htmlExport.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/motionPanel.ts`
  - *Purpose:* The panel where a motion is recorded without typing anything.  Four decisions and no keyboard: which object, what sets it off, what changes, and how fast. Everything else — the CSS, the keyframes, the checkbox a toggle needs, the script that carries its ARIA state — is derived, and the person recording never sees any of it.  The DOM half. Every decision it makes about what CSS to produce lives in motionCss.ts, and every rule about what a motion may contain lives in design/motion.ts; this file only asks the questions and shows the answers.. Defines: MotionPanel class, Change type, Easing type, Interaction type, MotionProp type. Methods: objects(), memberMap(), interactions(), save(), preview(), highlight(). Uses: ./i18n, ./design, /motionCss.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/template.ts`
  - *Purpose:* Templates and component instances.  A TEMPLATE is one self-contained JSON file, `*.exelmj-tpl.json`, holding one ComponentDef with its content inline. No database, no index to rebuild, no server: a template can be emailed, dropped in a folder, and used. That is the excalidraw-libraries model, and it is proven at scale precisely because it refuses to be clever.  An INSTANCE is a reference plus overrides. Editing the definition updates every instance; overriding a slot changes only that one. "Detach" expands an instance into ordinary objects and severs the link — the escape hatch that keeps the abstraction from ever being a trap.  Pure: no DOM, no filesystem. Unit-tested in node.. Defines: Shape type, PlacedImage type, TemplateFile type, Selection type, defFromSelection. Uses: ./design, /model.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/studio/templatePanel.ts`
  - *Purpose:* The templates panel: save a selection, browse the library, place an instance, and move templates in and out as files.  A template is ONE self-contained JSON file (see template.ts). That decision shows up here: the library is a flat list with no index to rebuild, no database to migrate, and "import" is just reading a file somebody emailed.. Defines: TemplatePanel class, TemplatePanelHost type. Methods: templates(), hasSelection(), saveSelection(), place(), remove(), add(). Uses: ./i18n, /model, /template.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/templates/templates.ts`
  - *Purpose:* Built-in Arabic-first business templates (invoice, payroll, budget, project tracker). Pure snapshot builders — File > New from Template feeds these to DocController. Sheets default to RTL in Arabic mode.. Defines: TemplateId type, Row type, text, num, formula. Uses: univerjs/core, ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/univer/formulaBarFix.ts`
  - *Purpose:* EXELMJ formula-bar fix — in Univer 0.25.1 the formula bar is display-only until a cell edit session exists: clicking it cold moves DOM focus but every keystroke is dropped (verified live; Excel starts editing on that click). Dispatching `sheet.operation.set-cell-edit-visible` alone does NOT help — the editor bridge is never primed and input stays dead. The only cold-start path that opens a WORKING session with the cell content preserved is a real double-click on the cell, so we intercept the cold formula-bar click and replay a synthetic double-click on the ACTIVE cell (mirror-aware). Once a session is open the bar's native input routing works, so we step aside.. Defines: ActivePoint type, activeCellPoint, synthesizeDblClick. Methods: getCellRect(). Uses: univerjs/presets.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/univer/hijri.ts`
  - *Purpose:* Hijri (Umm al-Qura) calendar functions — a regional differentiator no free Excel alternative ships. Registered as custom formula functions: HIJRI(serial)      → "1447/01/15"  (yyyy/mm/dd, latin digits — the Hindi digits display toggle transliterates them on screen) HIJRITEXT(serial)  → "١٥ محرم ١٤٤٧" (long month name, Arabic) HIJRIDAY/HIJRIMONTH/HIJRIYEAR(serial) → numbers HIJRITODAY()       → today as HIJRI() Excel knows none of these, so the exporter writes their computed VALUES and stashes the formulas in _EXELMJ_META; reopening in EXELMJ restores them.. Defines: serialToDate, coerceNumber, hijriParts, hijriFromSerial, hijriTextFromSerial. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/univer/rtlAlign.ts`
  - *Purpose:* EXELMJ RTL alignment fix.  rtlMirror.ts fakes right-to-left sheets by flipping the whole grid host with CSS scaleX(-1) (Univer 0.25.1 ships no RTL renderer). The flip mirrors the COLUMN order — exactly what we want — but it ALSO mirrors where the content sits INSIDE each cell: a cell the file explicitly aligns RIGHT is painted at its right edge and the flip lands it on the visual LEFT. Reported by the manager against Google Sheets, whose RTL view keeps such cells hugging the right edge (his report .xlsx carries horizontal="right" on every cell).  Fix: on RTL sheets swap the EXPLICIT horizontal alignment (left ⇄ right) at RENDER time only, via the cell-content interceptor's `interceptorStyle` (Styles.getStyleByCell merges it over the cell's own style). After the flip every cell lands on the side the file asked for, and the toolbar's align buttons read correctly too. Cells with NO explicit alignment are left alone,. Defines: FUniver type, Univer type, CellLike type, CellLocation type, swapHAlign. Methods: intercept(). Uses: univerjs/presets.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/univer/rtlDropdown.ts`
  - *Purpose:* EXELMJ RTL data-validation dropdown.  Proven on the packaged app with two files identical except for the sheet's rightToLeft flag: with the flag OFF Univer's own list dropdown opens on the first click (literal lists AND range-sourced ones); with it ON it never opens at ANY point of the cell — although the chip is drawn, the rule is loaded and hovering it still switches the cursor to a pointer (so the rule, the widget and its hit-test are all fine). The cell-anchored popup layer works under the mirror too — the column filter menu opens correctly — so what breaks is Univer's pointer-down → show-dropdown path inside the flipped host.  Rather than fight the engine, RTL sheets get their own list: a plain DOM popup appended to <body>, i.e. OUTSIDE the mirrored host, so it is never flipped (the same rule the editor overlay follows). It opens on a click on a cell carrying a `list` rule and writes the picked value through the facade.. Defines: parseListOptions, rangeOptions, optionsForCell. Uses: univerjs/presets, /rtlMirror.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/univer/rtlEditor.ts`
  - *Purpose:* EXELMJ RTL cell-editing overlay.  Univer 0.25.1's doc canvas editor has NO Unicode Bidi Algorithm: its shaper (ArabicHandler) naively REVERSES each Arabic run and lays runs out left-to- right; `paragraph.direction` / `section.contentDirection` are stored but ignored by layout (verified in the engine source and by live pixel/x-probe). So typing Arabic — and especially MIXED Arabic+Latin+digits — inside a cell shows garbled, back-to-front, left-flowing text, even though the committed GRID (which draws each cell as one browser-bidi fillText) looks correct.  Fix: while an RTL sheet's TEXT cell is being edited, cover Univer's canvas editor with a native <textarea dir="auto"; unicode-bidi:plaintext>. The browser does full, correct bidi + Arabic shaping + caret + right-to-left flow during editing. On commit we write the plain LOGICAL string to the cell via the facade (which parses numbers and formulas), and the grid renders it.. Defines: rtlSheet, cellEditorCanvas, editorLogicalText, activeCell. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/univer/rtlMirror.ts`
  - *Purpose:* EXELMJ RTL Mirror — renderer-level right-to-left sheets (column A on the RIGHT), which upstream Univer 0.25.1 does not ship (its renderer ignores worksheet.rightToLeft; verified in code, release notes and by pixel probe).  Mechanism, proven piece-by-piece in live experiments: 1. CSS scaleX(-1) on the sheet render host: geometry, headers, selections and overlays all mirror. The browser maps pointer coordinates through CSS transforms automatically, so hit-testing keeps working un-remapped. 2. Canvas text counter-flip: fillText/strokeText mirror each run around its own CENTER (stays inside its cell box), so after the CSS flip text reads normally. Scoped to canvases INSIDE the host — the formula bar canvas lives outside and must stay untouched. 3. drawImage counter-flip for picture sources only (HTMLImageElement / ImageBitmap) so photos aren't mirror-imaged; canvas-to-canvas blits pass through untouched.. Defines: setHindiDigits, isRtlMirrorActive, findHost, inHost. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/univer/setup.ts`
  - *Purpose:* The only place Univer is configured. Registers the 8 free OSS presets. FORBIDDEN: preset-sheets-advanced / any @univerjs-pro package (license-gated, adds a watermark + export caps) — see PROJECT_MAP.md [TECH_STACK].. Defines: FUniver type, Univer type, setupUniver. Uses: univerjs/presets, ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/direction.ts`
  - *Purpose:* Per-paragraph direction for the word editor: an explicit `dir` attribute on paragraphs and headings (the attribute the docx exporter reads — explicit per-node dir is the pattern that survives serialization and maps 1:1 to w:bidi). The editor ROOT carries the document default dir; this attribute is only set when a paragraph deviates or was imported with a direction.. Defines: Commands type. Methods: addGlobalAttributes(), addCommands(). Uses: tiptap/core.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/dirtyMux.ts`
  - *Purpose:* Main keeps ONE global dirty flag (the close-guard input). Two renderer documents feed it now — the sheet workbook and the word document — so this mux ORs the two before talking to the bridge. DocController reports through reportSheetDirty; the word module through reportWordDirty.. Defines: push, reportSheetDirty, reportWordDirty, reportDesignDirty, isSheetDirty.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/docxExport.ts`
  - *Purpose:* EXELMJ docx exporter — TipTap JSON → .docx bytes via the `docx` library.  Arabic-correctness rules (verified against OOXML docs + docx#3419): - Every RTL paragraph gets BOTH `bidirectional: true` (w:bidi) AND an explicit `alignment` — bidirectional alone leaves text stuck LEFT in Word. - Physical editor alignment maps to LOGICAL jc: rtl+right → START, rtl+left → END (and mirrored for LTR), center/justify pass through. That round-trips with the importer without ever flipping sides. - Runs containing Arabic get `rightToLeft: true` (w:rtl), and bold/italic/ size are emitted with their complex-script mirrors (w:bCs/w:iCs/w:szCs) — without those Word applies the format to Latin text only. - Tables in an RTL document get `visuallyRightToLeft`.. Defines: TipTapNode type, alignForExport, dataUrlToBytes, textRunsFor. Uses: docx.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/docxImport.ts`
  - *Purpose:* EXELMJ docx importer — .docx bytes → HTML for the TipTap editor.  Written in-house (same precedent as src/xlsx/): the popular converters are unusable for Arabic — mammoth deliberately drops alignment, direction, fonts and colors (a right-aligned RTL paragraph comes out as a bare LTR <p>), and docx-preview is read-only. This importer keeps exactly what the editor models: paragraphs/headings with LOGICAL alignment + direction, run formatting (incl. the complex-script mirrors Word uses for Arabic), lists, tables, and embedded images.  OOXML bidi rules honored here (see PROJECT_MAP): - w:bidi (paragraph) flips paragraph geometry; w:jc start/end are LOGICAL: start = RIGHT in an RTL paragraph, LEFT in LTR. left/right/center are physical. We resolve to a physical text-align for display but keep dir as its own attribute, so exporting maps back to logical start/end losslessly.. Defines: DocxImportResult type, XNode type, ParaProps type, tagName, children. Uses: jszip, fast-xml-parser.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/icons.ts`
  - *Purpose:* Ribbon icons — Fluent UI System Icons (c) Microsoft Corporation, MIT license. Source: https://github.com/microsoft/fluentui-system-icons (@fluentui/svg-icons)..
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/modeToggle.ts`
  - *Purpose:* The mode switch the manager asked for: a rounded sliding pill, fixed at the window's top corner, flipping between the THREE tools — the sheet app (#app / Univer), the word app (#word-app / TipTap) and the design app (#design-app / artwork overlay). The knob slides with an eased transform; the active label is highlighted. Lives on <body>, outside the mirrored sheet host (house rule for anything interactive while RTL sheets are mirrored).. Defines: AppMode type, currentMode, initModeToggle, setMode. Uses: ./i18n.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/printDoc.ts`
  - *Purpose:* Print HTML for the word document: the editor's HTML wrapped in a standalone A4 page (real margins live in @page — body padding would only apply to the first page). Printed through the existing hidden-window 'print:html' channel with preferCSSPageSize so Chromium honors the @page block.. Defines: html type, buildDocPrintHtml.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/ribbon.ts`
  - *Purpose:* EXELMJ Word-mode ribbon — an in-house, RTL-first Word-style ribbon.  Own code throughout. The layout follows the classic ribbon PATTERN (tab row, grouped controls with a label strip, table hover-grid picker, status-bar zoom) which is a functional UI method, studied from open-source references (ONLYOFFICE/LibreOffice ribbons — looked at, never copied) — see PROJECT_MAP. Icons are Microsoft's Fluent UI System Icons (MIT) inlined in icons.ts. No Office assets, no trademarks.. Defines: RibbonActions type, RibbonHandles type, icon, buildRibbon. Methods: newDoc(), open(), save(), saveAs(), print(), exportPdf(). Uses: ./i18n, /icons.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/word/wordApp.ts`
  - *Purpose:* EXELMJ Word mode — a Word-like docx editor living beside the sheet app.  The editor is TipTap (ProseMirror): a native contenteditable, so the BROWSER does Arabic bidi/shaping/caret — the exact property Univer's canvas engine lacks (which is why the sheet side needed the whole rtlMirror apparatus). The word container sits OUTSIDE the mirrored sheet host and is never affected by it.  File I/O goes through the existing bridge: readFile/saveFile/saveFileAs handle raw bytes for any extension; printing reuses the hidden-window 'print:html' channel with @page A4 + preferCSSPageSize.. Defines: WordApp class, TipTapNode type, RibbonActions type. Methods: mount(). Uses: tiptap/core, tiptap/starter-kit, tiptap/extension-text-align, tiptap/extension-text-style, tiptap/extension-highlight.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/chartMeta.ts`
  - *Purpose:* EXELMJ metadata rides INSIDE the xlsx in a veryHidden sheet (single-file promise). v3 payload: charts + pivot definitions (sheets referenced by ORDER INDEX), the original Univer sheet ids (so id-keyed resources like protection survive a round trip), and passthrough resources Excel has no mapping for. Invisible in Excel's Unhide dialog.. Defines: ExcelJS type, StoredChart type, StoredPivot type, CustomFormulaRef type, ExelmjMeta type. Uses: exceljs, ./charts, ./pivot.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/csv.ts`
  - *Purpose:* Own CSV engine (exceljs's csv needs node streams — not browser-safe). Auto-detects the delimiter (, ; or tab — Arabic Excel locales often use ;), falls back to windows-1256 decoding for legacy Arabic files, and prepends a UTF-8 BOM on export so Excel opens Arabic text correctly.. Defines: detectDelimiter, parseCsv, decodeCsvBytes. Uses: univerjs/core, /styleMap.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/exportXlsx.ts`
  - *Purpose:* Univer IWorkbookData snapshot → xlsx bytes (exceljs). Sets fullCalcOnLoad so real Excel recalculates all formulas on open.. Defines: CustomFormulaRef type, resolveStyle, sanitizeSheetName, normalizeValue, setCellValue. Uses: exceljs, univerjs/core, /styleMap, /resourceMap, /chartMeta.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/fidelityShield.ts`
  - *Purpose:* The Fidelity Shield: parts of a foreign xlsx that our pipeline does not model (pivot tables, native Excel charts/drawings, VBA macros) are RE-INJECTED into the exported file at zip level, so "open in EXELMJ, edit a cell, save" never destroys them. Sheets are matched by NAME (robust to reordering; renaming a sheet drops its attached parts — documented).  Preserved: xl/vbaProject.bin (+ macroEnabled workbook content type), pivotTable/pivotCache part chains, per-sheet drawing chains (native charts, their rels and media). Skipped: slicers, a sheet whose exported version already has its own drawing (EXELMJ images added this session), media name collisions.. Defines: FidelityReport type, fidelityMerge. Uses: jszip, /zipUtils.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/importXlsx.ts`
  - *Purpose:* xlsx bytes (exceljs) → Univer IWorkbookData snapshot. Fidelity contract lives in PROJECT_MAP.md [ARCHITECTURE].. Defines: StylePool type, poolStyle, convertCellValue. Uses: exceljs, univerjs/core, /styleMap, /resourceMap, /notesParser.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/notesParser.ts`
  - *Purpose:* exceljs 4.4.0 WRITES cell notes (xl/comments*.xml + VML) but its reader never surfaces them back on cell.note (verified empirically). This module reads them straight from the xlsx zip.. Defines: ParsedNote type, parseNotesFromZip. Uses: jszip, /styleMap, /zipUtils.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/resourceMap.ts`
  - *Purpose:* Maps Univer plugin "resources" (filter / data validation / conditional formatting) to and from exceljs. Resource JSON shapes were captured from a live fWorkbook.save() on @univerjs 0.25.1 — see PROJECT_MAP.md.  Fidelity contract (v2a): - Filter: the autoFilter RANGE only (no per-column criteria). - Data validation: literal lists, RANGE-sourced lists, whole/decimal/date/ textLength with operators. Custom formulas are skipped. - Conditional formatting: highlightCell (number ops incl. between/notBetween + containsText), colorScale, dataBar, iconSet. - Notes: Excel legacy notes ↔ Univer note plugin (size/visibility defaults). - Images: floating images ↔ Univer drawing plugin (anchored at cell corner; in-cell pixel offsets are approximated on export).. Defines: ExcelJS type, UniverResource type, PlainRange type, UniverDvRule type, UniverCfRule type. Uses: exceljs, univerjs/core, /styleMap.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/styleMap.ts`
  - *Purpose:* Bidirectional style/geometry mapping between exceljs and Univer models. Numeric enum values mirror @univerjs/core@0.25.1 (exact-pinned), verified against the installed .d.ts files. They are mirrored locally so the converter (and the node test runner) never runtime-imports the engine.. Defines: ExcelJS type, values enum, mirrors enum, applyTint, excelColorToRgb. Uses: exceljs, univerjs/core.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/src-2026-08-15-2320/xlsx/zipUtils.ts`
  - *Purpose:* Shared low-level helpers for reading xlsx zip internals (used by the notes parser and the fidelity shield).. Defines: JSZip type, Relationship type, SheetPart type, attr, unescapeXml. Uses: jszip.
  - *Last Modified:* 2026-08-15

- 🗂️ `backups/trace-working-2026-08-14/centerline.ts`
  - *Purpose:* Centreline tracing — Illustrator's "strokes" mode (tracing/strokes + maxstrokeweight), our own implementation.  The difference matters for line art: OUTLINE tracing of a 3px pen stroke gives a long closed loop wrapping both sides of the line, so the "line" is really a very thin filled sliver. Editing it, re-colouring it or changing its weight is then hopeless. CENTRELINE tracing gives one open path down the middle of the stroke plus a width — a real line, exactly what a technical drawing or a signature should become.  Method: 1. THINNING (Zhang–Suen): erode the shape symmetrically until it is one pixel wide, without breaking it apart. Two sub-iterations per pass with complementary rules — that symmetry is what keeps the skeleton centred. 2. GRAPH: skeleton pixels become nodes; ends (1 neighbour) and junctions. Defines: Centerline type, CenterlineResult type, thin.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/compound.ts`
  - *Purpose:* Releasing a compound path — turning one traced blob into separately selectable, separately COLOURABLE shapes.  THE PROBLEM THIS SOLVES trace.ts emits one Shape per colour layer, and each of those carries every region of that colour as a single `d` with many subpaths. So a traced logo arrives as a handful of opaque blobs: the user can move a whole colour, and nothing else. "Recolour just this petal" has no handle to grab.  THE OBVIOUS FIX IS WRONG Splitting every subpath into its own shape turns a donut into a solid disc, because the inner ring stops being a hole and becomes a second filled circle. Holes are not separate regions; they are part of their parent.  So: group each subpath with the holes it contains, and emit one shape per. Defines: SubPath type, Region type, groupRegions. Uses: /path, /transform, /shapes.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/curveFit.ts`
  - *Purpose:* Least-squares cubic Bézier fitting (Schneider's algorithm, Graphics Gems).  This is what separates a usable trace from a lumpy one. A pixel boundary is a staircase; routing a curve through the midpoint of every step — the cheap trick — turns each step into a bump, so a straight letter stroke comes out wavy. Fitting instead asks: what single cubic passes closest to ALL these points? The staircase averages out and the stroke comes back straight, while a genuine corner is preserved because the caller splits the run there first.  Pure maths, no DOM — unit-tested in node.. Defines: Pt type, Cubic type, normalize, bezierAt, chordLengths.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/gradientFit.ts`
  - *Purpose:* Linear-gradient detection for traced regions (Illustrator's enableGradient / GradientFidelity, our own implementation).  Why it matters: quantisation slices a smooth ramp into flat bands, and the step between two bands is visible as a hard edge — the classic "posterised" trace. Fitting the ORIGINAL pixels of each region with a linear colour ramp and emitting that instead of one flat colour makes neighbouring bands meet at the same colour, so the banding dissolves without adding a single path.  The fit is least-squares in closed form (no iteration, no random seeding), so the same picture always produces the same gradient.  Pure maths, no DOM — unit-tested in node.. Defines: LinearGradient type, GradientFitOptions type, fitPlane.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/isoContour.ts`
  - *Purpose:* Sub-pixel contour extraction (marching squares with linear interpolation).  Why this replaced walking the pixel lattice: a lattice walk can only put a boundary on an integer pixel edge, so every edge is a staircase and every anti-aliased or JPEG-softened pixel is forced to one side. Marching squares reads a CONTINUOUS field and places each crossing exactly where the field passes the threshold, so the boundary lands mid-way through the soft pixels — where the real edge is. That is worth roughly half a pixel everywhere, and it is what lets the curve fitter downstream produce a clean line instead of averaging a staircase.  Pure maths, no DOM — unit-tested in node. A closed loop of sub-pixel points, in PIXEL coordinates.. Defines: Loop type, isoContours.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/path.ts`
  - *Purpose:* The path kernel: ONE place every SVG path in the app is normalised, split into subpaths, read as nodes, and written back.  WHY A CHOKE POINT Paths reach us from four unrelated directions — the tracer (trace.ts), the Illustrator bridge, a pasted/imported SVG, and eventually the web picker — and each speaks a different dialect of the same grammar: relative commands, shorthand S/T, arcs, implicit repeats, exponent notation. Every consumer downstream (the node editor, the PDF content stream, the SVG exporter, the per-subpath recolour) would otherwise need to handle all of it. Instead everything funnels through normalize() here and comes out as absolute M / L / C / Z only. That is the single assumption that makes a node editor tractable at all.  Arcs specifically CANNOT survive a non-uniform scale — scaling an `A`. Defines: Seg type, SubPath type, normalize, parse. Uses: svgpath, /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/trace.ts`
  - *Purpose:* Raster → vector tracing (the manager's «تحويل إلى SVG», Illustrator's Image Trace in spirit — our own implementation, no third-party tracer).  The pipeline, in four exact steps: 1. VARIANCE-CUT quantisation → a small deterministic palette (see buildPalette: a median cut splits by rank and loses a small logo on a big white page, so the split point is chosen by variance instead). 2. STACKED LAYERS (the Inkscape "stack scans" idea): colours are ordered biggest-first and layer i's region is "this colour plus every colour painted above it". Lower layers extend UNDERNEATH upper ones, so every boundary between two colours is traced exactly once and a seam between two independently fitted curves cannot exist — matching is structural, not a post-fix. 3. A SOFT MEMBERSHIP field per layer — 0.5 exactly where a pixel sits half-way between the layer's colours and the rest — then SUB-PIXEL. Defines: Cubic type, Pt type, LinearGradient type, Centerline type, TracedPath type. Uses: /curveFit, /isoContour, /gradientFit, /centerline.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/trace.worker.ts`
  - *Purpose:* / <reference lib="webworker" /> The worker end of the tracing protocol. See traceWorker.ts for the client and for why this exists at all.  This file deliberately contains no algorithm: it unpacks a message, calls the SAME traceImage() the synchronous path calls, and posts results back. That is what makes "output is byte-identical to the synchronous path" true by construction rather than by testing two implementations against each other.. Defines: TracedPath type, cannot. Uses: /trace, /traceWorker.
  - *Last Modified:* 2026-08-14

- 🗂️ `backups/trace-working-2026-08-14/traceWorker.ts`
  - *Purpose:* The tracing worker.  Tracing a 4000x3000 image runs for several seconds of pure computation on the renderer thread, and until now that froze the window: no repaint, no cancel, no progress. The pipeline in trace.ts is already PURE (no DOM, no canvas — that is why it unit-tests in node), so it moves into a Worker unchanged. Nothing about the algorithm changes; only who runs it.  The protocol is deliberately tiny and typed on both ends. Two rules make it safe: 1. Every message carries the JOB ID. A late result from a cancelled job must be droppable, or a slow trace finishing after the user started a new one silently overwrites the new artwork. 2. Pixels are TRANSFERRED, not copied. A 4000x3000 RGBA buffer is 48 MB; structured-cloning it would cost more than some traces.. Defines: TraceRequest type, CancelRequest type, WorkerRequest type, ProgressMessage type, DoneMessage type. Methods: cancel(). Uses: /trace.
  - *Last Modified:* 2026-08-14

## 📁 docs

- 🗂️ `docs/EXCEL-REPLACEMENT-REPORT-AR.md`
  - *Purpose:* يصف هذا التقرير البحثي المتطلبات والميزات اللازمة لبرنامج EXELMJ ليحل محل Microsoft Excel بالكامل، مع التركيز على التوافق، الطباعة، الجداول المحورية، ودعم اللغة العربية.
  - *Last Modified:* 2026-07-17

- 🗂️ `docs/oss-research-2026-08-19.md`
  - *Purpose:* Documentation: EXELMJ Word Mode — Open-Source Decision Document — Scope: what to adopt, in what order, and what to never touch. Every item below is from the verified .
  - *Last Modified:* 2026-08-18

- 🗂️ `docs/oss-research-inventory.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-08-18

- 🗂️ `docs/prompt-motion-keyboard.md`
  - *Purpose:* Documentation: Prompt — Keyboard access for the Motion panel — Generated by `prompt-architect`, 2026-08-16. Paste the block below into a fresh.
  - *Last Modified:* 2026-08-16

- 🗂️ `docs/research/handoff-shards.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/handoff-spec.md`
  - *Purpose:* Documentation: EXELMJ Studio — Offline Handoff Artifacts — ---.
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/oss-gapfill.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/oss-synthesis.md`
  - *Purpose:* Documentation: EXELMJ Studio — Technical Recommendation — ---.
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/oss-verified.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/picker-parts.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/picker-port-plan.md`
  - *Purpose:* Documentation: EXELMJ Studio — Port Plan — **Source:** `E:\exten Picker` (AI Element Picker v3.2.0, MV3) · **Destination:** `D:\EXELMJ` (Electr.
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/studio-spec.md`
  - *Purpose:* Documentation: EXELMJ STUDIO — Architecture Specification — ---.
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/research/studio-verified.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-08-14

- 🗂️ `docs/web-edition-plan.md`
  - *Purpose:* Documentation: EXELMJ Web Edition (mobile PWA): Sheets + Documents. IN PROGRESS (M0–M4 done) — Date: 2026-09-25. Owner decision `ed7118a4`: "تطبيق ويب" (chosen over a Capacitor.
  - *Last Modified:* 2026-09-25

## 📁 electron

- 🗂️ `electron/illustrator.ts`
  - *Purpose:* The Illustrator bridge — Adobe's OWN supported automation, nothing else.  Why this exists: a .ai file keeps its editable state in Adobe's private AIPrivateData stream. We do not (and legally may not) reverse-engineer it. Instead we ask the INSTALLED Illustrator to open the file and hand us its text through Adobe's documented ExtendScript/COM interface. Everything runs offline on the user's machine.  Transport (chosen after live verification on AI 2026 / 30.3.0): COM `Illustrator.Application` → DoJavaScriptFile, driven by a spawned PowerShell shim. COM auto-launches Illustrator, works whether it is closed or already open, and — unlike an in-process native binding — the shim can be SIGKILLed if Illustrator throws a modal dialog (the #1 hang risk).  Arabic: the JSX writes PURE ASCII JSON (every non-ASCII char as \uXXXX), so. Defines: AiTextRun type, AiExtractResult type, detectIllustrator, runPowerShellSync. Uses: node:child_process, node:fs, node:os, node:path.
  - *Last Modified:* 2026-08-13

- 🗂️ `electron/ipc.ts`
  - *Purpose:* Defines: IpcHooks type, registerIpc. Methods: getWindow(), getSettings(), setLanguage(), addRecentFile(), setDirty(), setFonts(). Uses: electron, node:fs, node:path, /menu, /illustrator.
  - *Last Modified:* 2026-08-18

- 🗂️ `electron/main.ts`
  - *Purpose:* Defines: Lang type, Settings type, callRendererTool, resolveOpenable. Uses: electron, node:path, node:fs, /menu, /ipc.
  - *Last Modified:* 2026-08-18

- 🗂️ `electron/menu.ts`
  - *Purpose:* Defines: MenuItemConstructorOptions type, Lang type, MenuHooks type, buildAppMenu. Methods: getWindow(), sendToRenderer(), setLanguage(), openRecent(), getRecentFiles(), getHindiDigits(). Uses: electron, ./src.
  - *Last Modified:* 2026-08-13

- 🗂️ `electron/preload.ts`
  - *Purpose:* Uses: electron.
  - *Last Modified:* 2026-08-18

- 🗂️ `electron/studio/browserIpc.ts`
  - *Purpose:* The IPC surface of the embedded browser.  Kept in its own file rather than added to ipc.ts because the browser is owned PER WINDOW: every handler here has to resolve the caller's window from the event, not from a module-level "current window". A handler that used the focused window would drive the wrong preview the moment a second window is open — which EXELMJ supports.. Defines: IpcMainInvokeEvent type, Bounds type, Device type, BrowserIpcHooks type, browserFor. Methods: translate(). Uses: electron, node:path, node:fs, /browserView, /studioProtocol.
  - *Last Modified:* 2026-08-14

- 🗂️ `electron/studio/browserView.ts`
  - *Purpose:* The embedded mini-browser: a WebContentsView owned by the main process, with real device emulation.  WHY WebContentsView AND NOT <webview> `webviewTag` is off in EXELMJ today and stays off. A <webview> is a renderer-owned custom element with an awkward async API, Electron's own docs discourage it, and — decisive here — the renderer cannot reach `webContents.debugger` on it, which kills every CDP capability the device switch depends on. A WebContentsView gives main a real webContents with .debugger, .setBounds, .capturePage and its own session partition.  THE COST IS HONEST: we own the layout, and the view paints ABOVE renderer DOM. So the renderer sends bounds on every resize, all chrome lives outside the view rect, and any modal that must cover it removes the child view rather than trying to out-z-index it.. Defines: StudioBrowser class, Session type, Device type, Bounds type, approveOrigin. Uses: electron, ./.., /mcpProtocol.
  - *Last Modified:* 2026-08-14

- 🗂️ `electron/studio/guestPreload.ts`
  - *Purpose:* The guest preload: the element picker, running inside the previewed page.  WHY A PRELOAD AND NOT AN INJECTED SCRIPT A preload runs before ANY page script, in an ISOLATED world that shares the DOM but not the page's globals. That means the page cannot patch what we read (no monkey-patched getComputedStyle, no redefined getBoundingClientRect) and we do not have to fight for injection timing. The Chrome extension this replaces spent a whole subsystem on that fight — a version handshake, a liveness probe, a PING/inject dance — all of which is unnecessary here.  READ-ONLY BY CONSTRUCTION. This agent hovers, highlights and reads. It never clicks, types, submits or navigates. In Electron a synthesised click is TRUSTED — the page cannot tell it from the user's — so a picker that could click would be a picker that could really submit a form or really buy something. The capability is simply absent rather than guarded.. Defines: Layers type, build. Uses: electron.
  - *Last Modified:* 2026-08-14

- 🗂️ `electron/studio/mcpProtocol.ts`
  - *Purpose:* The MCP surface for EXELMJ Studio, as pure data + pure handlers.  SHAPE OF THE DECISION The server runs INSIDE the Electron main process, over Streamable HTTP bound to 127.0.0.1, with a per-launch bearer token. Two facts force this and both are worth recording so it is not re-litigated: 1. Every tool needs a live `webContents`, an attached CDP session, and the project on disk — all of which live in main. Out-of-process would add an IPC hop to every call and orphan in-flight calls on quit. 2. Electron's `utilityProcess` CANNOT use stdio: its docs state that configuring `stdin` to anything but `ignore` is unsupported and errors. So a stdio MCP server cannot live in a utility process at all. Claude Code speaks stdio, so a ~40-line shim bridges stdio to the local HTTP endpoint and reports a clean "EXELMJ is not running" instead of hanging.. Defines: ToolDef type.
  - *Last Modified:* 2026-08-14

- 🗂️ `electron/studio/mcpServer.ts`
  - *Purpose:* The MCP server, hosted inside the Electron main process.  TRANSPORT: Streamable HTTP on 127.0.0.1, ephemeral port, per-launch bearer token written to <userData>/studio/mcp.json. See mcpProtocol.ts for why this and not stdio (utilityProcess cannot have stdin) and why the token is not optional (loopback is not an authorization boundary).  The server owns no state of its own: every tool call is forwarded to the renderer that actually holds the document, and the renderer answers over the existing IPC channel. That keeps ONE source of truth — the open document — rather than a second copy in main that could drift from what the user sees.. Defines: IncomingMessage type, Server type, ServerResponse type, ToolResult type, McpHost type. Methods: callTool(), close(). Uses: node:http, node:crypto, node:fs, node:path, /mcpProtocol.
  - *Last Modified:* 2026-08-14

- 🗂️ `electron/studio/studioProtocol.ts`
  - *Purpose:* Serving a generated project to the embedded browser, offline.  NOT a dev server, and NOT file://.  A local HTTP server would mean a port, a firewall prompt on Windows, and something reachable by anything else on the machine. file:// is worse: it is an OPAQUE origin, so the page gets no localStorage, no IndexedDB, no modules without CORS pain, and no secure context — and then the project behaves completely differently the moment it is deployed to https://, which is the worst possible time to find out.  A privileged custom scheme gives the page a real origin AND a secure context, with no port and no server process. `studio://<projectId>/<path>`.. Defines: Session type, ProjectResolver type, registerStudioScheme, resolveStudioPath. Uses: electron, node:fs, node:path.
  - *Last Modified:* 2026-08-14

## 📁 graphify-out

- 🗂️ `graphify-out/.graphify_analysis.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_ast.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_chunk_01.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_detect.json`
  - *Purpose:* JSON data. Top-level keys: files, total_files, total_words, needs_graph, warning, skipped_sensitive, unclassified, walk_errors.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_labels.json`
  - *Purpose:* JSON data. Top-level keys: 0, 1, 2, 3, 4, 5, 6, 7.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_labels.json.sig`
  - *Purpose:* Project file (.sig)
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_python`
  - *Purpose:* Project file (unknown)
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_root`
  - *Purpose:* Project file (unknown)
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/.graphify_uncached.txt`
  - *Purpose:* Project file (.txt)
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/GRAPH_REPORT.md`
  - *Purpose:* provides a comprehensive graph report of the codebase, detailing its structure, connections, communities, and key abstractions.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/ast/v0.9.18/9dd747ed4b2907d44007222e0613cb451e3191a1fe0570a289af49c7c43b4483.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/ast/v0.9.18/dda1923eb89206f3664202a2e5c79d6a032503fb570aef5166a79a42d8c58e59.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/00e55a222557e4f5aae8b0554020d1a09c8ccc7b20debaa6ae3bc7a4587fdf07.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/04c3c62b185bce77f32c375fab38bbdea7747fc74db966b07e87d7a844c133b3.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/5d9133c996a80bee71249e2e1fe2c797eae69f38ec390315d55d786260cd3317.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/819e765caaad1f5918c1a1784fa39432140376832e2502666fc19983a42f04c2.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/89bc2cb44b71080d2a5652b54c82b72ab771c30dcf84465cea330f0f61bc38ab.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/8e399c5867206c48fc9085809d675e91d417ea98c57e2a9f589832a978a4f5a0.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/a68050bf0a04061dec61114bcf4aeaf707139164b0c6914aae70dd7bac0bacc0.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/semantic/b96eef9c21871949cd99c07968c2e186b25eae5e3b3e4993b5caa4914cb91534.json`
  - *Purpose:* JSON data. Top-level keys: nodes, edges, hyperedges.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/cache/stat-index.json`
  - *Purpose:* JSON data. Top-level keys: D:\EXELMJ\.cursor_file_memory.json, D:\EXELMJ\.smart_lessons.json, D:\EXELMJ\.smart_session_notes.json, D:\EXELMJ\Lessons-Learned.md, D:\EXELMJ\PROJECT_MAP.md, D:\EXELMJ\README-USER.md, D:\EXELMJ\Session-Notes.md, D:\EXELMJ\Tree-Project.md.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/graph.html`
  - *Purpose:* HTML page: graphify - graphify-out\graph.html.
  - *Last Modified:* 2026-07-17

- 🗂️ `graphify-out/graph.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-07-17

## 📁 resources

- 🗂️ `resources/icons/hugeicons.json`
  - *Purpose:* JSON configuration/data file
  - *Last Modified:* 2026-08-14

## 📁 scripts

- 🗂️ `scripts/build-electron.mjs`
  - *Purpose:* Bundles the Electron main process + preload with esbuild. Output: dist-electron/main.cjs + dist-electron/preload.cjs Usage: node scripts/build-electron.mjs [--watch]. Defines: copyShim. Uses: esbuild, node:fs/promises.
  - *Last Modified:* 2026-08-14

- 🗂️ `scripts/cdp.py`
  - *Purpose:* A tiny CDP client for driving the REAL EXELMJ window. Why this and not screenshot-and-click-pixels: devicePixelRatio here is 1.25, so a coordinate read off a screenshot lands 25% away from where it looks. Every click below is dispatched at CSS pixels taken from getBoundingClientRect, which is the only measurement the page and the input system agree on. Usage from another script: from cdp import App app = App() app.js("...")            # evaluate, returns the value app.click_sel("#foo")    # trusted click at the element's centre app.shot("name.png"). Defines: App class. Methods: send(), js(), rect(), _mouse(). Uses: cdp, base64, json, os, time.
  - *Last Modified:* 2026-09-07

- 🗂️ `scripts/dev.mjs`
  - *Purpose:* Dev runner: bundles electron files, starts the Vite dev server for the renderer, then launches Electron pointed at it. Ctrl+C or closing the app window stops everything. (Main-process changes need a dev restart.). Uses: node:child_process, vite, electron.
  - *Last Modified:* 2026-07-17

- 🗂️ `scripts/make-icon.mjs`
  - *Purpose:* Zero-dependency generator for resources/icon.ico: draws a 256×256 green rounded square with a white spreadsheet-table glyph, encodes PNG (own CRC32 + zlib deflate) and wraps it in a single-entry ICO.
  - *Last Modified:* 2026-07-17

- 🗂️ `scripts/make-web-icons.mjs`
  - *Purpose:* Generates the web edition icons (src/web/public/icons: icon-192, icon-512, icon-maskable-512) by redrawing the desktop icon's measured geometry (green #1e7145 rounded square, white table: header bar over 4 cells) with 4x4 supersampling and a built-in minimal PNG encoder; no dependencies. npm run icons:web.
  - *Last Modified:* 2026-09-25

- 🗂️ `scripts/mcp-shim.mjs`
  - *Purpose:* Defines: connection, forward. Uses: node:fs/promises, node:readline, node:os, node:path.
  - *Last Modified:* 2026-08-14

- 🗂️ `scripts/pick-icons.mjs`
  - *Purpose:* Defines: main. Uses: node:fs/promises, node:path.
  - *Last Modified:* 2026-08-14

## 📁 src

- 🗂️ `src/charts/ChartFloat.tsx`
  - *Purpose:* This component renders interactive ECharts visualizations, dynamically building chart options and managing their lifecycle with a ChartManager.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/charts/chartDialog.ts`
  - *Purpose:* Native DOM modal for insert/edit chart: kind select (bar/line/area/pie), title, A1 range (prefilled from active selection, validated); creates via ChartManager.addChart or updates existing (opened from chart ✎ button).
  - *Last Modified:* 2026-07-17

- 🗂️ `src/charts/chartManager.ts`
  - *Purpose:* Manages the lifecycle, rendering, and persistence of charts within the Univer spreadsheet application, updating them on sheet value changes.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/charts/chartTypes.ts`
  - *Purpose:* Defines chart types and their data source configurations for visualization.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/design/aiBackground.ts`
  - *Purpose:* Illustrator/PDF background rendering for the design mode.  Modern .ai IS a PDF container (since Illustrator 9 the native format embeds a complete PDF; Illustrator's private data hides in /AIPrivateData streams every renderer ignores). So pdf.js renders .ai directly — each artboard is a page. The worker is bundled INLINE (blob worker) because packaged Electron loads over file:// where a module worker from a file URL is blocked.. Defines: ArtworkKind type, ArtworkDoc type, ExtractedText type, PageRule type, ensureWorker. Methods: render(), extractText(), extractRuns(), imageRects(), pageRules(), noPdfContent(). Uses: pdfjs-dist, pdfjs-dist/build, /bidiRuns.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/design/align.ts`
  - *Purpose:* Align and distribute — the operations that turn a pile of objects into a layout, and the ones every design tool is judged on.  Two rules, both learned from tools that get them wrong:  1. ALIGNMENT MOVES OBJECTS, NEVER RESIZES THEM. "Align left" means put every left edge on the same x. A tool that stretched objects to match would be doing something the user did not ask for and cannot easily undo.  2. DISTRIBUTE SPACES THE GAPS, NOT THE CENTRES. Evenly spaced CENTRES look wrong the moment the objects differ in size — the gaps come out unequal, which is what the eye actually reads. Spacing the gaps is what "distribute" means to a designer, and it is why this is not a one-line average.  Pure: no DOM. Unit-tested in node.. Defines: AlignMode type, DistributeMode type, Positioned type, alignDeltas. Uses: /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/bidiRuns.ts`
  - *Purpose:* Bidi handling for pdf-lib output — the ONE gap fontkit leaves.  Proven on this machine (scratch probe, content-stream level): pdf-lib's fontkit applies full Arabic GSUB shaping AND reverses a pure-RTL line into visual order, so logical-order Arabic must be passed UNCHANGED. But it has no UAX#9: it flips the WHOLE line, so embedded LTR runs (digits, Latin) come out mirrored — «07717835312» rendered «21353871770». Pre-reversing ONLY those LTR runs cancels the flip exactly.. Defines: normalizeArabicText, lineIsRtl, toPdfVisual.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/design/boolean.ts`
  - *Purpose:* Path boolean operations (union/subtract/intersect/exclude) for Design mode — relocated from the retired standalone Vector page. Flattens shapes via path.ts's flatten() and clips with the 'polygon-clipping' npm dependency; returns a path Shape with a blank id for designApp.ts to assign via its own shapeIdSeq. Unit-tested in tests/designBoolean.test.ts.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/design/centerline.ts`
  - *Purpose:* Centreline tracing — Illustrator's "strokes" mode (tracing/strokes + maxstrokeweight), our own implementation.  The difference matters for line art: OUTLINE tracing of a 3px pen stroke gives a long closed loop wrapping both sides of the line, so the "line" is really a very thin filled sliver. Editing it, re-colouring it or changing its weight is then hopeless. CENTRELINE tracing gives one open path down the middle of the stroke plus a width — a real line, exactly what a technical drawing or a signature should become.  Method: 1. THINNING (Zhang–Suen): erode the shape symmetrically until it is one pixel wide, without breaking it apart. Two sub-iterations per pass with complementary rules — that symmetry is what keeps the skeleton centred. 2. GRAPH: skeleton pixels become nodes; ends (1 neighbour) and junctions. Defines: Centerline type, CenterlineResult type, thin.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/design/compound.ts`
  - *Purpose:* Releasing a compound path — turning one traced blob into separately selectable, separately COLOURABLE shapes.  THE PROBLEM THIS SOLVES trace.ts emits one Shape per colour layer, and each of those carries every region of that colour as a single `d` with many subpaths. So a traced logo arrives as a handful of opaque blobs: the user can move a whole colour, and nothing else. "Recolour just this petal" has no handle to grab.  THE OBVIOUS FIX IS WRONG Splitting every subpath into its own shape turns a donut into a solid disc, because the inner ring stops being a hole and becomes a second filled circle. Holes are not separate regions; they are part of their parent.  So: group each subpath with the holes it contains, and emit one shape per. Defines: SubPath type, Region type, groupRegions. Uses: /path, /shapes.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/contextMenu.ts`
  - *Purpose:* What the right-click menu offers, and when each entry is live.  The LABELS and the HANDLERS stay in designApp — they need i18n and the document. What lives here is the decision: given the state of the selection, the clipboard and the history, which entries are enabled.  It is separate because "make sure they actually work" is a claim that has to be checkable, and an entry that is enabled when its action cannot run is the exact failure that makes a menu untrustworthy. Every rule below is pinned by a test. Everything an entry is allowed to look at.. Defines: MenuState type, MenuAction type, MenuItem type, MenuEntry type, contextMenu.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/curveFit.ts`
  - *Purpose:* Least-squares cubic Bézier fitting (Schneider's algorithm, Graphics Gems).  This is what separates a usable trace from a lumpy one. A pixel boundary is a staircase; routing a curve through the midpoint of every step — the cheap trick — turns each step into a bump, so a straight letter stroke comes out wavy. Fitting instead asks: what single cubic passes closest to ALL these points? The staircase averages out and the stroke comes back straight, while a genuine corner is preserved because the caller splits the run there first.  Pure maths, no DOM — unit-tested in node.. Defines: Pt type, Cubic type, normalize, bezierAt, chordLengths.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/design/designApp.ts`
  - *Purpose:* EXELMJ Design mode — open Illustrator (.ai), PDF and SVG artwork, write Arabic text over it naturally, re-edit those texts any time, and export.  Model: the artwork is a READ-ONLY background (canvas via pdf.js for ai/pdf, live shadow-DOM svg for svg). The user's text lives in overlay boxes (native contenteditable — full Arabic bidi/shaping/caret from Chromium), stored in PDF points and persisted to a sidecar <file>.exelmj.json so they stay editable forever. Exports produce NEW files (PDF with real vector text via pdf-lib, or PNG); the original artwork is never touched. For SVG, the file's OWN <text> elements are also editable in place and saved back.. Defines: ArtworkDoc type, ExtractedText type, PageInfo type, PageBoxes type, TextBox type. Uses: ./i18n, /aiBackground, /inpaint, /overlayModel, /trace.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/design/docSetup.ts`
  - *Purpose:* What a NEW document is: how big, in what unit, at what resolution, and for screen or for print.  The app's own unit is the PostScript POINT everywhere else, so this module exists to be the single place any other unit is converted — and to make the two conversions that are easy to get wrong impossible to get wrong here:  - a PIXEL has no fixed physical size. It only means something once a resolution is chosen, which is exactly why DPI belongs in this dialog rather than buried in the export settings; - a MILLIMETRE does, and it never depends on the resolution. Wiring mm through the DPI is the classic bug that makes a 300dpi A4 come out four times too big.  Pure: no DOM. Unit-tested in node.. Defines: Unit type, ColorMode type, DocSetup type, ptPerUnit, toPt.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/gradientFit.ts`
  - *Purpose:* Linear-gradient detection for traced regions (Illustrator's enableGradient / GradientFidelity, our own implementation).  Why it matters: quantisation slices a smooth ramp into flat bands, and the step between two bands is visible as a hard edge — the classic "posterised" trace. Fitting the ORIGINAL pixels of each region with a linear colour ramp and emitting that instead of one flat colour makes neighbouring bands meet at the same colour, so the banding dissolves without adding a single path.  The fit is least-squares in closed form (no iteration, no random seeding), so the same picture always produces the same gradient.  Pure maths, no DOM — unit-tested in node.. Defines: LinearGradient type, GradientFitOptions type, fitPlane.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/design/group.ts`
  - *Purpose:* Transforming a SELECTION rather than a single object.  The overlay draws eight grips and a rotation grip around a multi-selection, but nothing was listening: applyOverlayResize only knew how to move one object, so the grips were decoration and dragging them did nothing. A library icon arrives as several separate runs, which is precisely why "the icon cannot be enlarged" — there was no single object to resize.  The two operations are here, pure, because the mistakes they invite are arithmetic ones: mapping a member from the wrong reference box, or rotating each member in place so the arrangement never actually turns.. Defines: Box type, scaleInGroup, orbitInGroup, spinInGroup. Uses: /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/grouping.ts`
  - *Purpose:* Membership: which objects belong together, and what a click on one means.  A group here is a RECORD, not a container (see studio/model.ts). Nothing moves into it and nothing is nested inside it — the flat per-page arrays are untouched, so every renderer and exporter keeps working without knowing groups exist. All that changes is what a selection RESOLVES to.  Pure, and unit-tested in node: the mistakes this invites are set-arithmetic ones — a group left holding a deleted child, a selection that expands forever, two groups that should have merged and did not.. Defines: GroupList type, groupOf, resolveSelection, makeGroup, ungroup. Uses: ./studio.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/handles.ts`
  - *Purpose:* The selection overlay: eight resize grips, a rotate grip, four crop grips, and the smart guides drawn while something is being dragged.  One overlay serves BOTH shapes and images. Before this, images had their own single corner grip (`.dz-img-grip`) with its own drag code and shapes had no grips at all — two behaviours for the same gesture, and neither could rotate. Everything here works on a plain { x, y, w, h } box plus a rotation, so the caller only has to say what the selected object's box IS and what to do when it changes. The maths lives in transform.ts and is unit-tested in node; this file is the DOM half and deliberately holds no geometry of its own.. Defines: Box type, HandleId type, SnapGuides type, rotateCursor. Uses: /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/images.ts`
  - *Purpose:* Images/logos the user places over the artwork (design mode's «صورة» tool).  Same coordinate contract as text boxes and shapes: PDF POINTS from the page's TOP-LEFT. The pixels live in the sidecar as a data URL so the placement survives a re-open without depending on the source file still being there — the manager swaps a client logo once and the file travels with the design.  Only PNG and JPEG are accepted: those are the two formats pdf-lib can embed, so anything that lands here is guaranteed to survive the PDF export.. Defines: PlacedImage type, PageImages type, isEmbeddableImage, num, fitIntoPage.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/inpaint.ts`
  - *Purpose:* Cover patches that DISAPPEAR into the artwork.  A flat median-colored rectangle is invisible on a solid background and glaringly obvious on a gradient one (the manager's real files are gradient posters — "يصبح واضح انك وضعت شيء فوق الصورة"). So instead of one color we RECONSTRUCT the background across the covered area:  for every interior pixel, blend the horizontal interpolation between the ring pixels on its row with the vertical interpolation between the ring pixels on its column.  That reproduces a linear gradient in ANY direction almost exactly (each interpolation is already correct along its own axis), stays smooth across two-tone blends, and degrades to the plain average on a solid area — while costing one getImageData + a per-pixel loop.. Defines: CoverPatch type, Rect type, RGB type, Ring type, stripToRgb.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/design/isoContour.ts`
  - *Purpose:* Sub-pixel contour extraction (marching squares with linear interpolation).  Why this replaced walking the pixel lattice: a lattice walk can only put a boundary on an integer pixel edge, so every edge is a staircase and every anti-aliased or JPEG-softened pixel is forced to one side. Marching squares reads a CONTINUOUS field and places each crossing exactly where the field passes the threshold, so the boundary lands mid-way through the soft pixels — where the real edge is. That is worth roughly half a pixel everywhere, and it is what lets the curve fitter downstream produce a clean line instead of averaging a staircase.  Pure maths, no DOM — unit-tested in node. A closed loop of sub-pixel points, in PIXEL coordinates.. Defines: Loop type, isoContours.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/marquee.ts`
  - *Purpose:* Marquee selection: drag a rectangle over the canvas to select everything under it, then move the lot together.  The geometry is pure so the two decisions that matter can be tested without a canvas:  1. WHAT COUNTS AS SELECTED. Every serious editor uses INTERSECTION, not containment: a user who drags a band across a row of objects means the ones they swept over, not only the ones they fully enclosed. Requiring containment makes large objects nearly unselectable and is the single most common complaint about hand-rolled marquees.  2. WHAT THE HANDLES MEASURE. A multi-selection's box is the union of the ROTATED bounds of its members — using each member's unrotated box would draw a frame that visibly excludes artwork the user can see is selected.. Defines: Box type, Shape type, Selectable type, dragRect, intersects. Uses: /transform, /shapes, /images, /overlayModel.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/motion.ts`
  - *Purpose:* What happens when someone touches a thing.  The model, and only the model: a record of intent, with no idea that CSS exists. motionCss.ts turns it into a stylesheet, the panel edits it, and the canvas previews it — three consumers, one shape of data, and none of them able to invent a field the others do not know about.  It is a SIDE-TABLE, the same doctrine as groups and frames (studio/model.ts): interactions reference objects by id and nothing moves into them, so every renderer and exporter that knows nothing about motion still draws the right picture. A document that records no interaction serialises as version 3 exactly as it always did.  Pure: no DOM. Unit-tested in node.. Defines: Trigger type, MotionProp type, Stop type, Change type.
  - *Last Modified:* 2026-08-15

- 🗂️ `src/design/motionPresets.ts`
  - *Purpose:* The one-press motions.  What actually makes Lordicon and its kind usable by somebody who does not program is not the engine — it is that "a bell that rings" is ONE press, not nine decisions. Each preset here is a fully-decided interaction body; the panel stamps it onto a new interaction and everything about it can still be edited afterwards, because it is made of the same fields as a hand-built one.  Two families, because they answer two different questions: hover  — what does it do when TOUCHED appear — how does it ARRIVE  Values are chosen against the references, not invented: swings decay (±12 → ∓10 → ±6 → 0) rather than tick like a metronome; idles are slow and shallow because they play forever and anything faster reads as a bug; and. Defines: PresetPatch type, IconPreset type. Uses: /motion.
  - *Last Modified:* 2026-08-15

- 🗂️ `src/design/nodeEdit.ts`
  - *Purpose:* The node editor overlay: per-anchor grips and Bezier control handles for a selected path.  This is what closes the longest-standing gap in the design page — "traced paths cannot be re-coloured or node-edited, they can only be moved and deleted". The geometry all lives in path.ts (pure, node-tested); this file is the DOM half, deliberately shaped like handles.ts so the two overlays behave the same way under the hand.  The path being edited is in the shape's LOCAL pt space (0,0 at shape.x/y), so every coordinate here is converted through the shape origin exactly once, at the boundary. Mixing the two spaces is the classic bug in this kind of editor and the reason the conversion is confined to toLocal/toPage below.. Defines: NodeEditor class, Seg type, NodeEditCallbacks type, Grab type. Methods: onChange(), onCommit(), destroy(), open(). Uses: /path.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/outline.ts`
  - *Purpose:* Stroke → outline: turning a stroked run into a filled shape.  WHY IT MATTERS HERE Two callers need it. Icon authoring (M4) has to ship outlined paths, because a stroked icon scaled to 16px renders its stroke at whatever width the consumer's renderer decides, while an outlined one is exact at every size. And centreline traces (centerline.ts) come back as stroked runs down the middle of a pen stroke — outlining them is what makes them fillable, gradient-able and boolean-able like every other region.  WHY NOT RASTERISE The two popular libraries for this (svg-outline-stroke, oslllo/svg-fixer) both rasterise the stroke and re-trace the bitmap. A 1.5pt stroke rasterised at 16px and re-traced comes back as garbage, and one of them exact-pins a native image module that will not build on Electron 43. bezier-js works on. Defines: Seg type, SubPath type, LineCap type, LineJoin type, OutlineOpts type. Uses: bezier-js, /path.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/overlayModel.ts`
  - *Purpose:* The design overlay model: the text boxes the user lays over an AI/PDF/SVG background. Coordinates are PDF POINTS measured from the page's TOP-LEFT (screen-like; converted to PDF bottom-up space only at export), so boxes are zoom-independent and survive re-opens.  Persistence: a sidecar JSON next to the original file (<file>.exelmj.json), schema v2: boxes PER PAGE (artboard) — v1 held a single page and artboard navigation silently destroyed the other artboards' texts (review finding). The original artwork is NEVER modified.. Defines: PageShapes type, Shape type, PageImages type, PlacedImage type, StudioDoc type. Uses: /shapes, /images, ./studio.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/path.ts`
  - *Purpose:* The path kernel: ONE place every SVG path in the app is normalised, split into subpaths, read as nodes, and written back.  WHY A CHOKE POINT Paths reach us from four unrelated directions — the tracer (trace.ts), the Illustrator bridge, a pasted/imported SVG, and eventually the web picker — and each speaks a different dialect of the same grammar: relative commands, shorthand S/T, arcs, implicit repeats, exponent notation. Every consumer downstream (the node editor, the PDF content stream, the SVG exporter, the per-subpath recolour) would otherwise need to handle all of it. Instead everything funnels through normalize() here and comes out as absolute M / L / C / Z only. That is the single assumption that makes a node editor tractable at all.  Arcs specifically CANNOT survive a non-uniform scale — scaling an `A`. Defines: Seg type, SubPath type, normalize, parse. Uses: svgpath, /transform.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/pdfOverlayExport.ts`
  - *Purpose:* Export the design composition: the ORIGINAL vector artwork (when it is a PDF/.ai) — or a rasterized SVG background — with the user's Arabic text boxes drawn on top as real PDF text.  Arabic correctness proven on this machine at content-stream level: pdf-lib+fontkit shape Arabic (GSUB init/medi/fina) and reverse pure-RTL lines by themselves — text must be passed in LOGICAL order, with ONLY the embedded LTR runs pre-reversed (bidiRuns.toPdfVisual).. Defines: PDFFont type, PDFPage type, Shape type, OverlayExportInput type, exportOverlayPdf. Methods: getFont(). Uses: pdf-lib, pdf-lib/fontkit, /bidiRuns, /overlayModel, /shapes.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/shapes.ts`
  - *Purpose:* Vector shapes the user draws over the artwork (design mode's "شكل" tools).  Same coordinate contract as the text boxes: PDF POINTS from the page's TOP-LEFT, so a shape is zoom-independent and survives re-opens. For rect and ellipse (x, y) is the top-left corner and (w, h) the size; for line and arrow (x, y) is the FIRST endpoint and (w, h) the SIGNED delta to the second, which is what lets a line be drawn in any of the four directions.  Geometry here is pure (no canvas, no DOM) precisely so it is unit-testable in node; the painting helpers take a context and only translate. 'path' is not drawn by hand — it is what the image tracer produces.. Defines: ShapeKind type, Shape type, PageShapes type, cleanGradient.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/svgDesign.ts`
  - *Purpose:* SVG artwork support for the design mode: faithful mounting + IN-PLACE text editing (the part .ai/PDF cannot offer) + valid re-serialization.  Rules learned from research (see PROJECT_MAP): - Parse with DOMParser('image/svg+xml') and mount inside a SHADOW ROOT: Illustrator's internal <style> uses generic class names (.st0/.cls-1) that would collide with the app and other files. innerHTML would mangle xlink:href namespaces — never use it. - Editing happens in an OVERLAY contenteditable (Chromium gives Arabic bidi/shaping/caret for free); SVG itself has no text editing. - Illustrator splits runs into kerning tspans with per-glyph x arrays — collapse to one tspan before writing the new string. - CSS classes beat presentation attributes: inline the computed font/fill into style attributes on first edit so later changes actually apply. - Illustrator writes PostScript font names (ArialMT, Cairo-Regular…): keep. Defines: names class, SvgTextTarget type, parseSvg, mountSvg, lengthToPx.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/design/trace.ts`
  - *Purpose:* Raster → vector tracing (the manager's «تحويل إلى SVG», Illustrator's Image Trace in spirit — our own implementation, no third-party tracer).  The pipeline, in four exact steps: 1. VARIANCE-CUT quantisation → a small deterministic palette (see buildPalette: a median cut splits by rank and loses a small logo on a big white page, so the split point is chosen by variance instead). 2. STACKED LAYERS (the Inkscape "stack scans" idea): colours are ordered biggest-first and layer i's region is "this colour plus every colour painted above it". Lower layers extend UNDERNEATH upper ones, so every boundary between two colours is traced exactly once and a seam between two independently fitted curves cannot exist — matching is structural, not a post-fix. 3. A SOFT MEMBERSHIP field per layer — 0.5 exactly where a pixel sits half-way between the layer's colours and the rest — then SUB-PIXEL. Defines: Cubic type, Pt type, LinearGradient type, Centerline type, TracedPath type. Uses: /curveFit, /isoContour, /gradientFit, /centerline.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/trace.worker.ts`
  - *Purpose:* / <reference lib="webworker" /> The worker end of the tracing protocol. See traceWorker.ts for the client and for why this exists at all.  This file deliberately contains no algorithm: it unpacks a message, calls the SAME traceImage() the synchronous path calls, and posts results back. That is what makes "output is byte-identical to the synchronous path" true by construction rather than by testing two implementations against each other.. Defines: TracedPath type, cannot. Uses: /trace, /traceWorker.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/traceWorker.ts`
  - *Purpose:* The tracing worker.  Tracing a 4000x3000 image runs for several seconds of pure computation on the renderer thread, and until now that froze the window: no repaint, no cancel, no progress. The pipeline in trace.ts is already PURE (no DOM, no canvas — that is why it unit-tests in node), so it moves into a Worker unchanged. Nothing about the algorithm changes; only who runs it.  The protocol is deliberately tiny and typed on both ends. Two rules make it safe: 1. Every message carries the JOB ID. A late result from a cancelled job must be droppable, or a slow trace finishing after the user started a new one silently overwrites the new artwork. 2. Pixels are TRANSFERRED, not copied. A 4000x3000 RGBA buffer is 48 MB; structured-cloning it would cost more than some traces.. Defines: TraceRequest type, CancelRequest type, WorkerRequest type, ProgressMessage type, DoneMessage type. Methods: cancel(). Uses: /trace.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/design/transform.ts`
  - *Purpose:* Resize / rotate / crop geometry for the design canvas.  Same coordinate contract as the rest of src/design: PDF POINTS from the page's TOP-LEFT. Everything here is PURE — no canvas, no DOM — precisely so it unit-tests in node like shapes.ts and images.ts do.  The one non-obvious piece is resizing a ROTATED box. Dragging the SE handle of a box rotated 30° must keep the NW corner nailed to the page while the box grows along its OWN axes. Doing that in page space produces the familiar "the shape swims away from the cursor" bug. The fix is to work in the box's LOCAL frame (rotate the pointer back by -rotation about the centre), resize there, then place the new centre so the anchor corner lands exactly where it already was. resizeRotated() below is that, and nothing else.. Defines: Box type, HandleId type, boxCenter, rotatePoint, toLocal. Uses: svgpath, /shapes.
  - *Last Modified:* 2026-08-15

- 🗂️ `src/design/wordExport.ts`
  - *Purpose:* AI/PDF → editable WORD converter (the manager's client workflow: designs arrive as .ai, clients need .docx they can retype).  Recipe: the artwork page becomes a full-page image placed BEHIND the text (its own printed runs already wiped with sampled-background patches by the caller), and every detected text run becomes a Word PARAGRAPH FRAME — absolutely positioned at the same pt coordinates (Word frames use twips, 1pt = 20 twips) — so the document opens in Word looking like the design, with every line directly editable.. Defines: TextBox type, WordRun type, DesignWordInput type, buildDesignWord. Uses: docx, /overlayModel.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/doc/docController.ts`
  - *Purpose:* Defines: DocController class, FUniver type, PrintCell type, TemplateId type. Methods: newWorkbook(). Uses: univerjs/presets, ./i18n, ./xlsx, ./univer, ./word.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/format/formatActions.ts`
  - *Purpose:* حزمة التحكم الاحترافي: FormatActions تغلّف واجهات Univer المؤكدة وتعمل على التحديد النشط، تُستدعى من قوائم اليكترون عبر توزيع main.ts. تشمل الحدود بكل الأنواع بما فيها 'none' (بدون حدود — طلب المدير الملموس) عبر FRange.setBorder، دمج/إلغاء دمج، التفاف/إلغاء، إدراج/حذف صفوف وأعمدة (insertRowsBefore/After وdeleteRows/Columns)، إخفاء/إظهار صفوف وأعمدة، ارتفاع صف وعرض عمود عبر نافذة رقمية صغيرة (promptNumber بديل window.prompt المعطّل في اليكترون)، تثبيت/إلغاء ألواح (setFreeze/cancelFreeze)، مسح تنسيق/محتوى/الكل، إدراج ورقة/صورة/رابط/تعليق، و=TODAY()‎ و=HIJRITODAY()‎ كصيغة {f}. مُختبرة حياً: كل الإجراءات تُغيّر النموذج صحيحاً وقوائم اليكترون تظهر وتنفّذ في التطبيق المحزّم.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/i18n/ar.json`
  - *Purpose:* Internationalization translations — JSON configuration/data file
  - *Last Modified:* 2026-09-25

- 🗂️ `src/i18n/en.json`
  - *Purpose:* Internationalization translations — JSON configuration/data file
  - *Last Modified:* 2026-09-25

- 🗂️ `src/i18n/i18n.ts`
  - *Purpose:* Manages application language translations and directionality for different locales.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/index.html`
  - *Purpose:* HTML page: EXELMJ.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/main.ts`
  - *Purpose:* Defines: Lang type, DocumentView type, BorderChoice type, boot. Uses: /i18n, /univer, /doc, /charts, /word.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/photo/adjustments.ts`
  - *Purpose:* Pixel math for adjustment layers (brightness/contrast, hue/saturation, levels, black&amp;white), applied in place to the compositor's running composite so adjustment layers stay non-destructive. Unit-tested in tests/photoAdjustments.test.ts.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/photo/compositor.ts`
  - *Purpose:* Hand-implemented W3C blend-mode math (all 16 CSS/Photoshop blend modes) plus alpha compositing (compositeOnto/compositeLayers), and IncrementalCompositor which caches a per-layer-stack-position snapshot so changing one layer only recomposites it and the layers above it. Unit-tested in tests/photoCompositor.test.ts.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/photo/history.ts`
  - *Purpose:* Generic undo/redo command stack (HistoryStack&lt;T&gt;) used by PhotoApp: each command carries apply/invert and a human-readable name for a future History panel.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/photo/io.ts`
  - *Purpose:* Photo file IO: pure manifest build/parse for the native .exelmjphoto zip container (manifest.json + one PNG per raster layer, via jszip), plus DOM-dependent canvas encode/decode (PNG/JPEG export, decoding any raster the browser understands) used only inside the Electron renderer.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/photo/model.ts`
  - *Purpose:* MJEXEL Photo's layered raster document model — pure, DOM-free types (RasterLayer/AdjustmentLayer/PhotoDocument) and pure functions (create/add/remove/reorder/update layer, crop) that always return a new document, never mutate. Unit-tested in tests/photoModel.test.ts.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/photo/photoApp.ts`
  - *Purpose:* PhotoApp — the new raster/layers editor page mounted at #photo-app, wired into the sheet/word/design/photo mode pill exactly like WordApp/DesignApp. Canvas + toolbar (move/brush/eraser/rect-select/ellipse-select/eyedropper/crop/gradient) + layers panel + adjustment-layer properties + undo/redo + New/Open/Save/Save-As/PNG/JPEG export, RTL/i18n throughout. Lasso, clone-stamp, a text/shape tool, and crash-recovery autosave are NOT built yet (documented follow-up).
  - *Last Modified:* 2026-09-07

- 🗂️ `src/photo/tools.ts`
  - *Purpose:* Pixel-level tool logic: soft circular brush/eraser stamping and stroke rasterization, rect/ellipse/lasso selection-mask rasterizers, eyedropper sampling, and linear-gradient fill — all pure functions over PixelBuffer/SelectionMask.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/pivot/pivotDialog.ts`
  - *Purpose:* نافذة بناء الجدول المحوري (توأم chartDialog، DOM أصلي بلا إطار): نطاق البيانات (يُملأ من التحديد النشط) + ثلاث قوائم حقول (صفوف/أعمدة/قيم) تُملأ تلقائياً من رؤوس الصف الأول للنطاق عبر PivotManager.readHeaders + قائمة دالة التلخيص، وزر موافق يستدعي PivotManager.addPivot. تعمل بالعربي والإنجليزي عبر مفاتيح i18n.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/pivot/pivotEngine.ts`
  - *Purpose:* محرك الجداول المحورية النقي (بدون أي استيراد من Univer، قابل للاختبار كلياً): buildPivot يأخذ صفوف البيانات (بلا الرأس) + مواصفات (حقل صفوف/أعمدة/قيم + دالة) ويعيد شبكة ثنائية جاهزة للكتابة. يدعم sum/count/average/min/max، إجماليات صفوف وأعمدة وإجمالي كلي، فرز مفاتيح رقمي عند كون الكل رقماً وإلا عربي/إنجليزي، تجاهل غير الرقمي (عدا count)، خانات فارغة null، ودمج المفاتيح الفارغة تحت (فارغ). معرّفات الدلاء مفصولة بمحرف NUL لمنع التصادم.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/pivot/pivotManager.ts`
  - *Purpose:* دورة حياة الجداول المحورية: يقرأ نطاق المصدر عبر univerAPI، يحسب عبر المحرك النقي، وينشئ ورقة هدف (FWorkbook.create) ويكتب النتيجة كخلايا مع تنسيق خفيف آمن لاكسل (رؤوس/إجماليات عريضة + خلفيات + عرض أعمدة) ومطابقة اتجاه RTL للمصدر. addPivot/refreshAll/serialize/restore/clear + readHeaders لملء النافذة + onChange للترقيم القذر. التعريفات تركب snapshot.custom.exelmjPivots عند الحفظ (→ _EXELMJ_META) وتعود عبر importXlsx.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/pivot/pivotTypes.ts`
  - *Purpose:* أنواع الجداول المحورية: PivotAgg (sum/count/average/min/max) وPivotDef (المصدر sourceSheetId + نطاق A1 صفه الأول رؤوس + إزاحات الحقول rowField/colField/valueField صفرية داخل النطاق + الدالة + ورقة الهدف targetSheetId). الإزاحات صفرية لئلا تكسر إعادة تسمية الرأس التعريف.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/print/printHtml.ts`
  - *Purpose:* generates print-ready HTML from sheet data, including styles, merges, and charts, for system print dialogs or PDF export.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/public/pdfjs/cmaps/78-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/78-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/78-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/78-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/78-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/78-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/78ms-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/78ms-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/83pv-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/90ms-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/90ms-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/90msp-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/90msp-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/90pv-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/90pv-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Add-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Add-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Add-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Add-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-6.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-GB1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-GB1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-GB1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-GB1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-GB1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-GB1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-3.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-4.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-5.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-6.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Korea1-0.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Korea1-1.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Korea1-2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/B5pc-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/B5pc-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/CNS-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/CNS-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/CNS1-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/CNS1-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/CNS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/CNS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/ETHK-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/ETHK-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/ETen-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/ETen-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/ETenms-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/ETenms-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Ext-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Ext-RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Ext-RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Ext-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GB-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GB-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GB-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GB-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBK-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBK-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBK2K-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBK2K-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBKp-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBKp-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBT-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBT-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBT-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBT-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBTpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBTpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/GBpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKdla-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKdla-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKdlb-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKdlb-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKgccs-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKgccs-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKm314-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKm314-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKm471-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKm471-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKscs-B5-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/HKscs-B5-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Hankaku.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Hiragana.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSC-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSC-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSC-Johab-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSC-Johab-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSCms-UHC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSCms-UHC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSCpc-EUC-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/KSCpc-EUC-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Katakana.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/LICENSE`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/NWP-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/NWP-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/RKSJ-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/RKSJ-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/Roman.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniCNS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniGB-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UCS2-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UCS2-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UTF16-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UTF16-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UTF32-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UTF32-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UTF8-H.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/UniKS-UTF8-V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/V.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/cmaps/WP-Symbol.bcmap`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/iccs/CGATS001Compat-v2-micro.icc`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/iccs/LICENSE`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitDingbats.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitFixed.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitFixedBold.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitFixedItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitSerif.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitSerifBold.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitSerifItalic.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/FoxitSymbol.pfb`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/LICENSE_FOXIT`
  - *Purpose:* Copyright 2014 PDFium Authors. All rights reserved.  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:  * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. * Neither the name of Google Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission..
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/standard_fonts/LICENSE_LIBERATION`
  - *Purpose:* Defines: of type.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/LICENSE_JBIG2`
  - *Purpose:* Copyright 2014 The PDFium Authors  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:  * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. * Neither the name of Google Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission..
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/LICENSE_OPENJPEG`
  - *Purpose:* The copyright in this software is being made available under the 2-clauses BSD License, included below. This software may be subject to other third party and contributor rights, including patent rights, and no such rights are granted under this license. Copyright (c) 2002-2014, Universite catholique de Louvain (UCL), Belgium Copyright (c) 2002-2014, Professor Benoit Macq Copyright (c) 2003-2014, Antonin Descampe Copyright (c) 2003-2009, Francois-Olivier Devaux Copyright (c) 2005, Herve Drolon, FreeImage Team Copyright (c) 2002-2003, Yannick Verschueren Copyright (c) 2001-2003, David Janssens Copyright (c) 2011-2012, Centre National d'Etudes Spatiales (CNES), France Copyright (c) 2012, CS Systemes d'Information, France.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/LICENSE_PDFJS_JBIG2`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/LICENSE_PDFJS_QCMS`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/LICENSE_QCMS`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/jbig2.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/jbig2_nowasm_fallback.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: EmscriptenEH class, EmscriptenSjLj class, ExitStatus class, ExceptionInfo class, JBig2.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/openjpeg.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/openjpeg_nowasm_fallback.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: EmscriptenEH class, EmscriptenSjLj class, ExitStatus class, OpenJPEG, instantiate.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/qcms_bg.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/quickjs-eval.js`
  - *Purpose:* THIS FILE IS GENERATED - DO NOT EDIT. Defines: G class, QuickJS, y, E, ba.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/public/pdfjs/wasm/quickjs-eval.wasm`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-08-13

- 🗂️ `src/studio/browserPanel.ts`
  - *Purpose:* The mini-browser panel: an address bar, the three device pills, and the rectangle the native view is told to occupy.  THE ONE STRUCTURAL FACT that shapes this file: the WebContentsView is a NATIVE child of the window and paints ABOVE all renderer DOM. Nothing here can overlap it, and no CSS can put anything on top of it. So the panel is a frame around a HOLE — a placeholder div whose measured rectangle is sent to main on every layout change, and everything the user interacts with lives outside that rectangle.  A consequence worth stating: when the panel is hidden or scrolled out of view the native view must be told, or it goes on painting over whatever is now in that part of the window.. Defines: BrowserPanel class, Device type, BrowserPanelHost type. Methods: onPicked(), pickProjectFolder(), importLast(), setStatus(). Uses: ./i18n, /devices.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/bundle.ts`
  - *Purpose:* The ZIP handoff bundle.  One emitter, two audiences, kept in SEPARATE directories: - everything at the top level is for the consuming agent, and is enough on its own to rebuild the design without EXELMJ; - source/ is our own reload path, and the agent is told to ignore it. Mixing them is how a bundle ends up with two descriptions of the same thing that can disagree.  Determinism matters more than it looks: an export that differs byte-for-byte every time makes "what changed since last week" unanswerable. Entries are sorted, timestamps are fixed, and nothing reads the clock — the generation time is passed IN.. Defines: HandoffInput type, BundleFile type, bundleFiles. Uses: jszip, /htmlExport, /motionCss, ./design, /color.
  - *Last Modified:* 2026-08-15

- 🗂️ `src/studio/captureImport.ts`
  - *Purpose:* Turning a picked web element into canvas objects.  This is the bridge the whole picker exists for, and it is the place where a wrong answer is hardest to notice: the result LOOKS like a design either way. So two rules govern it.  1. CSS PIXELS ARE NOT POINTS. The web measures in px (1/96in); the canvas measures in pt (1/72in). Importing px as pt shrinks everything by exactly 25%, uniformly — which reads as a deliberately smaller design, not as a bug, and survives review.  2. NEVER INVENT. A transparent background is not black. An unreadable colour is not a colour. A child with no recorded box is not at (0,0). Anything that cannot be reproduced is REPORTED in `degraded` so the handoff can say so, rather than being filled in with something plausible.. Defines: TextBox type, Capture type, ImportResult type, ImportOptions type, pxToPt. Uses: ./design, /handoff.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/color/contrast.ts`
  - *Purpose:* Contrast — WCAG 2.x relative luminance, hand-rolled in ten lines.  WHY NOT APCA (the WCAG 3 draft algorithm, which is perceptually better) The whole APCA toolchain is legally unusable for a distributed product: `apca-w3` is published All Rights Reserved with patent(s) pending and a grant limited to "web content", and it depends on `colorparsley`, which is AGPL-3.0. That chain silently taints every popular tool built on it — Adobe's Leonardo, apcach, Huetone, Harmonizer. WCAG 2.x is the only contrast algorithm in this space that is both a published standard and unencumbered, and it is also the one accessibility law actually cites.  The formula is small enough that depending on anything for it would be the strange choice.  Pure maths. Unit-tested against the published W3C examples.. Defines: LCH type, ContrastVerdict type, relativeLuminance, contrastRatio, verdict. Uses: /oklab.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/color/extract.ts`
  - *Purpose:* "Extract the colours from this image" — with ZERO new dependencies.  EXELMJ already owns a strong quantiser: src/design/trace.ts builds a palette by variance-cut splitting (keep splitting while a cluster's per-pixel SSE is still > 360), refines it with a deterministic k-means seeded from that cut, and runs a rescue pass over the FULL image so a small-but-distinct colour — a thin rule, one gold seal — is not lost because it never appeared in the sample. That is better than what a general-purpose colour-extraction library would give us, and it is already unit-tested.  So this file adds the ONE thing the tracer does not care about: naming. Six anonymous hexes are not a palette; Dominant / Vibrant / Muted / Dark / Light / Accent is. The role scoring is node-vibrant's taxonomy, reimplemented in ~40 lines against our own OKLCH so it agrees with the rest of the system.. Defines: RGB type, LCH type, Role type, Swatch type, ExtractOptions type. Uses: ./.., /oklab, /scale.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/color/oklab.ts`
  - *Purpose:* OKLab / OKLCH and the sRGB gamut boundary.  Vendored from Björn Ottosson's public reference implementation of Oklab (https://bottosson.github.io/posts/oklab/ and .../gamutclipping/), which the author released into the public domain / MIT. Roughly 200 lines, one file, zero dependencies.  WHY THIS FILE EXISTS AT ALL, given culori is a dependency culori converts colours. It does not answer "for THIS hue and THIS lightness, what is the most saturated colour sRGB can actually show?" — and that question is the whole colour picker. compute_max_saturation() answers it in a fitted polynomial plus one Halley step, i.e. a handful of FLOPs, which is what lets the picker draw a live gamut boundary at 60fps on a 2D canvas with no solver in the loop. A binary search per pixel would not.. Defines: RGB type, Lab type, LCH type, srgbToLinear, linearToSrgb.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/color/scale.ts`
  - *Purpose:* Tonal scales, harmony, dark-mode derivation and colour-vision simulation.  The design goal for the scale generator is the one thing a design system actually needs and almost no generator delivers: **equal step index means equal lightness across every hue**. Get that and contrast stops being a per-pair check and becomes a system invariant — swapping brand-600 for red-600 anywhere cannot break a contrast requirement, because the two have the same lightness by construction. Miss it and every hue needs its own contrast audit forever.  So the ladder is a fixed list of OKLab lightnesses, shared by all hues, and only the chroma varies per hue (clamped to what sRGB can show at that lightness). That is the whole algorithm, and its simplicity is the point.. Defines: LCH type, Step type, Scale type, ScaleOptions type. Uses: /oklab.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/color/tokens.ts`
  - *Purpose:* Design tokens in and out — DTCG on disk, CSS custom properties for the web, and an Adobe Swatch Exchange file for Illustrator and Photoshop.  The on-disk shape is the W3C Design Tokens Community Group format ($value / $type / $description, groups by nesting), which is why StudioDoc.tokens is already spelled that way in src/studio/model.ts: export is then a pass-through with no renaming layer to drift out of sync.  .ase matters more than it looks. EXELMJ already has an Illustrator COM bridge, so a palette written as .ase round-trips natively into the two tools the user already has open — no copy-pasting hex codes.. Defines: Scale type, CssOptions type, scaleToGroup, isToken, resolveToken. Uses: ./model, /scale.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/colorPanel.ts`
  - *Purpose:* The colour panel: an OKLCH picker with a live gamut boundary, scale generation from one seed, contrast verdicts, extract-from-image, dark-mode derivation and token export.  WHY THE PICKER IS HAND-ROLLED Every framework-free picker worth using has a blocking flaw for this app. The one with real RTL support (Coloris) documents that there is only ONE instance — a shape inspector needs a FILL picker and a STROKE picker side by side, so that is a functional block, not a preference. And none of them draw the sRGB gamut boundary, which is the entire reason to pick in OKLCH: without it the user drags into colours the screen cannot show and silently gets something else back.  The boundary is cheap because oklab.ts answers "max chroma at this L and hue" in a fitted polynomial plus one Halley step, so it can be evaluated per pixel. Defines: ColorPanel class, LCH type, ContrastVerdict type, CVD type, Scale type. Methods: tokens(), onChange(), selectedImagePixels(), applyToSelection(), saveFile(). Uses: ./i18n, /color, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/devices.ts`
  - *Purpose:* The device catalogue behind the desktop / tablet / mobile switch.  WHY A DEVICE IS MORE THAN A WIDTH Making the preview narrower is not previewing a phone. A phone reports a device pixel ratio (so `2x` images and `image-set()` resolve differently), a touch-capable pointer (so `@media (pointer: coarse)` and `(hover: none)` match, which is what turns hover menus into tap menus), and a mobile user agent (which server-side and JS feature detection both key off). A viewport that lies about those three shows a desktop layout squeezed into a phone width — the exact bug the switch exists to catch.  The numbers are transcribed from Chromium's own emulated-device list (BSD-licensed) for the handful we ship, rather than vendoring the whole file.. Defines: the class, Device type.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/handoff.ts`
  - *Purpose:* The design handoff: one model, two encodings — a Markdown spec and a ZIP bundle manifest.  THE FAILURE MODE THIS IS DESIGNED AGAINST is confident silent wrongness: an agent produces output that is plausible, self-consistent, visually close and wrong, with nothing anywhere signalling that it is wrong. Points read as pixels give a uniform 33% scale error that reads as a design choice. A captured component with no per-node geometry gets invented flex values that still measure the right outer box. An LTR capture is faithfully rebuilt with `margin-left` in an Arabic-first product.  So the governing rule here is: AN ABSENT FACT MUST BE LOUDER THAN A WRONG ONE. Every field that could be guessed is either populated or explicitly marked unknown with the reason. A handoff that omits something and says so is correct; one that omits it silently is defective even if everything it does. Defines: PageShapes type, Shape type, HandoffInput type, Manifest type. Uses: ./design, /color, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/htmlExport.ts`
  - *Purpose:* The design as real HTML and CSS.  WHY THIS EXISTS The handoff bundle described the design — a Markdown spec, colour tokens, SVG assets, the source file. A description is not a page. Nothing could be opened in a browser, and nothing could carry an animation, because a CSS animation is a rule attached to an ELEMENT and there were no elements.  WHAT IT GUARANTEES - One element per object, with a STABLE class derived from its id. Motion rules are written against those classes (see motionCss.ts), so the two modules agree without either importing the other's output. - LOGICAL properties only (inset-inline-start, not left). The document is Arabic-first, and a page that hard-codes `left` mirrors wrongly the moment its direction flips — which is the whole reason the handoff. Defines: derived class, an class, cannot class, HtmlPage type, HtmlInput type. Uses: ./design, /model.
  - *Last Modified:* 2026-08-15

- 🗂️ `src/studio/icon/export.ts`
  - *Purpose:* Icon export: SVG, PNG at any size, and a real multi-resolution Windows .ico.  The .ico writer is here rather than a dependency because every ICO generator on npm pulls in a native image module (sharp / jimp), and this app has to build on Electron 43 for Windows without a native toolchain. The format is small and fully specified, and we already have the PNGs.  ICO holds PNG entries directly (Vista+), which is what every modern tool emits and what Windows has read for two decades — so the writer is a header, a directory, and the PNG bytes we already produced.. Defines: IconPath type, SvgOptions type, xml, toSvg. Uses: /presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/icon/presets.ts`
  - *Purpose:* Icon-system presets — the published grid rules of the three sets worth following, transcribed as DATA rather than reimplemented as behaviour.  These numbers are the actual difference between "a small drawing" and "an icon". A 24dp Material icon lives inside a 20dp live area with 2dp of padding, its exterior corners are 2dp and its INTERIOR corners are square; Lucide strokes 2 at round cap and join with 2 units between elements; Octicons ships every glyph at BOTH 16 and 24 rather than scaling one to the other, because a 24px glyph shrunk to 16 loses its stroke alignment.  The four Material keyline shapes matter most: they are why a circular icon and a square icon in the same set look the same SIZE despite the circle being geometrically larger.. Defines: IconPreset type, Keyline type.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/icon/validate.ts`
  - *Purpose:* The pixel-fit validator — "will this icon still be crisp at 16px?"  WHY THIS IS THE FEATURE, not a nicety An icon is the one drawing whose final size is decided by someone else, and at 16px a half-pixel offset is a visible blur across the whole glyph. The rule is unintuitive: whether a coordinate should land on a whole pixel or on a half depends on the STROKE WIDTH's parity. A 1px stroke is centred on its path, so it covers a whole pixel only when its centreline sits at x.5; a 2px stroke covers two whole pixels only when its centreline sits at a whole number. Getting that backwards is why hand-drawn icons look soft while the same shape from a real icon set looks sharp.  The validator therefore reports, per target size, exactly which nodes are off and by how much — a light that says "amber" without naming the node is not actionable.. Defines: Seg type, Offender type, SizeReport type, IconReport type, integerScaleSizes. Uses: ./.., /presets.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/iconPanel.ts`
  - *Purpose:* The icon panel: a preset picker, a live preview strip, the pixel-fit validator, and the export row.  WHY THE PREVIEW STRIP IS THE FEATURE, not decoration: an icon is the one drawing whose final size is decided by somebody else. Drawing at 24 and shipping at 16 is the normal case, and the difference between a crisp glyph and a soft one is invisible at authoring size. The strip renders the same artwork at every target size on every commit, so the failure is visible while it is still cheap to fix.  The validator does the half of that the eye cannot: it names the node that is off the pixel grid, at which size, and by how much.. Defines: IconPanel class, IconPath type, IconPreset type, IconLibrary type, IconPanelHost type. Methods: iconPaths(), updatePathD(), makeIconArtboard(), currentPreset(), saveFile(), setStatus(). Uses: ./i18n, ./design, /icon.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/layout.ts`
  - *Purpose:* Auto-layout on the canvas — the flexbox subset a UI designer actually uses.  WHY WE IMPLEMENT IT RATHER THAN EMBED YOGA Yoga (and Taffy) are excellent and both are a WASM binary plus a loader, for a feature that needs one axis, a gap, padding, two alignment axes, wrapping and three sizing modes. That subset is ~200 lines and is EXACTLY testable against a real browser's flexbox, which is the oracle that matters. Shipping a WASM module into a lean offline app to avoid writing 200 tested lines is the wrong trade — and a wrong-but-embedded layout engine is harder to debug than a wrong-but-ours one.  WHAT IT IS NOT: this is not a CSS engine. No percentages, no min/max, no baseline alignment, no grid. Those are the things a canvas designer does not reach for, and each one that is missing is a thing that cannot be subtly wrong.. Defines: LayoutBox type, LayoutChild type, LayoutResult type, origin, layoutFrame. Uses: /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/layoutPanel.ts`
  - *Purpose:* The layout panel: wrap a selection into an auto-layout frame and edit it.  This is the tab that turns the canvas from a drawing surface into a UI tool. The engine is in layout.ts (pure, node-tested); this file is the inspector, and it applies the computed positions straight back onto the flat arrays — so PDF, SVG, PNG and Word export need to know nothing about frames.  That last point is the whole reason frames are a SIDE-TABLE rather than a node tree: layout resolves to absolute points, and every existing exporter keeps working untouched.. Defines: LayoutPanel class, LayoutPanelHost type. Methods: frames(), selectedFrame(), selectFrame(), wrapSelection(), applyLayout(), unwrap(). Uses: ./i18n, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/mcpHandlers.ts`
  - *Purpose:* The renderer half of the MCP surface: where a tool call meets the open document.  Everything here is a pure function of a DocumentView, so the whole tool surface is testable in node without Electron, a window, or a running app. designApp supplies the view; this file never touches the DOM.. Defines: HandoffInput type, DocumentView type, ToolResult type, of, runStudioTool. Methods: handoff(), placeComponent(), markDirty(), open(), setDevice(), screenshot(). Uses: /color, /handoff, /bundle, /template, /devices.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/model.ts`
  - *Purpose:* Defines: PageInteractions type, TokenRef type, PageKind type, FrameDirection type, FrameAlign type. Uses: ./design.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/motionCss.ts`
  - *Purpose:* The compiler: an interaction model in, a stylesheet out.  This is the piece written from scratch rather than imported. Nothing here depends on a runtime, a library or a build step — what comes out is CSS text that a browser already knows how to run, which is the only way the export can be opened on a machine with nothing installed.  WHAT IT KNOWS, AND WHAT IT REFUSES TO PRETEND Six triggers reach the browser with no script at all: hover, press, focus, appear, scroll, and — through a hidden checkbox — toggle. The checkbox has a real cost: CSS cannot set `aria-pressed`, so a screen reader is never told the button's state. `emitAria` therefore writes four lines of plain script to carry the state, and turning it off is a deliberate choice the caller makes, not a default it stumbles into.. Defines: Change type, Easing type, Interaction type, MotionProp type, MarkupInject type. Uses: ./design, /htmlExport.
  - *Last Modified:* 2026-08-15

- 🗂️ `src/studio/motionPanel.ts`
  - *Purpose:* The panel where a motion is recorded without typing anything.  Four decisions and no keyboard: which object, what sets it off, what changes, and how fast. Everything else — the CSS, the keyframes, the checkbox a toggle needs, the script that carries its ARIA state — is derived, and the person recording never sees any of it.  The DOM half. Every decision it makes about what CSS to produce lives in motionCss.ts, and every rule about what a motion may contain lives in design/motion.ts; this file only asks the questions and shows the answers.. Defines: MotionPanel class, Change type, Easing type, Interaction type, MotionProp type. Methods: objects(), memberMap(), interactions(), save(), preview(), highlight(). Uses: ./i18n, ./design, /motionCss.
  - *Last Modified:* 2026-08-15

- 🗂️ `src/studio/template.ts`
  - *Purpose:* Templates and component instances.  A TEMPLATE is one self-contained JSON file, `*.exelmj-tpl.json`, holding one ComponentDef with its content inline. No database, no index to rebuild, no server: a template can be emailed, dropped in a folder, and used. That is the excalidraw-libraries model, and it is proven at scale precisely because it refuses to be clever.  An INSTANCE is a reference plus overrides. Editing the definition updates every instance; overriding a slot changes only that one. "Detach" expands an instance into ordinary objects and severs the link — the escape hatch that keeps the abstraction from ever being a trap.  Pure: no DOM, no filesystem. Unit-tested in node.. Defines: Shape type, PlacedImage type, TemplateFile type, Selection type, defFromSelection. Uses: ./design, /model.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/studio/templatePanel.ts`
  - *Purpose:* The templates panel: save a selection, browse the library, place an instance, and move templates in and out as files.  A template is ONE self-contained JSON file (see template.ts). That decision shows up here: the library is a flat list with no index to rebuild, no database to migrate, and "import" is just reading a file somebody emailed.. Defines: TemplatePanel class, TemplatePanelHost type. Methods: templates(), hasSelection(), saveSelection(), place(), remove(), add(). Uses: ./i18n, /model, /template.
  - *Last Modified:* 2026-08-14

- 🗂️ `src/templates/templates.ts`
  - *Purpose:* Arabic-first template builders (invoice/payroll/budget/project tracker) returning IWorkbookData snapshots with styles, formulas, merges, freeze, RTL flag in Arabic mode; project template ships a status dropdown (DV) + red-if-متأخر CF rule.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/univer/findAllSheets.ts`
  - *Purpose:* Sheet-mode find across ALL worksheets: flips every new Univer find session to workbook scope (replace keeps current-sheet), and mounts a small strip inside the find dialog — "found in N sheets" plus one chip per sheet (name + match count, active sheet highlighted) that jumps to that sheet's match. Pure helpers groupMatchesBySheet/sheetCountPhrase are unit-tested; reads per-sheet matches from Univer 0.25.1 internals (_model._findModels), degrading to no strip if they move.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/univer/formulaBarFix.ts`
  - *Purpose:* إصلاح شريط المعادلات: في Univer 0.25.1 الشريط يتجاهل الكتابة قبل وجود جلسة تحرير (الأمر set-cell-edit-visible وحده لا يجهز المحرر — مثبت حياً). الوحدة تلتقط pointerdown على كانفس الشريط (الكانفس الوحيد داخل header)، وعند غياب الجلسة تبتلع النقرة وتصنع نقراً مزدوجاً اصطناعياً على الخلية النشطة عبر getCellRect (معكوس السينات عند تفعيل exelmj-rtl-host، مع scroll-to-range وإعادة محاولة إذا كانت الخلية خارج الشاشة) فتفتح جلسة كاملة بمحتوى محفوظ وتنساب الكتابة للخلية والشريط معاً.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/univer/hijri.ts`
  - *Purpose:* Hijri (Umm al-Qura) calendar functions — a regional differentiator no free Excel alternative ships. Registered as custom formula functions: HIJRI(serial)      → "1447/01/15"  (yyyy/mm/dd, latin digits — the Hindi digits display toggle transliterates them on screen) HIJRITEXT(serial)  → "١٥ محرم ١٤٤٧" (long month name, Arabic) HIJRIDAY/HIJRIMONTH/HIJRIYEAR(serial) → numbers HIJRITODAY()       → today as HIJRI() Excel knows none of these, so the exporter writes their computed VALUES and stashes the formulas in _EXELMJ_META; reopening in EXELMJ restores them.. Defines: serialToDate, coerceNumber, hijriParts, hijriFromSerial, hijriTextFromSerial. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/univer/rtlAlign.ts`
  - *Purpose:* Fixes horizontal alignment under the RTL mirror. rtlMirror's scaleX(-1) flips the column order (wanted) but also flips where content sits inside each cell, so a cell the xlsx aligns RIGHT lands on the visual LEFT. initRtlAlign(univer, univerAPI) registers a SheetInterceptorService INTERCEPTOR_POINT.CELL_CONTENT interceptor (effect Style, priority 0 so data-validation/numfmt run first) that, on sheets with rightToLeft===1, swaps EXPLICIT ht left(1)⇄right(3) via cell.interceptorStyle — Styles.getStyleByCell merges interceptorStyle over the cell style, so nothing is written to the workbook and save/export/autosave are untouched. Unset/center alignment is left alone so General keeps Excel's RTL behaviour (text right, numbers left). The sheet services do not exist when createUniver returns ("[redi]: Expect 1 dependency item(s)"), so registration retries on LifeCycleChanged and at 100/400/1200ms and warns at 5s if it never landed. Exports the pure helper swapHAlign (unit-tested).
  - *Last Modified:* 2026-08-10

- 🗂️ `src/univer/rtlDropdown.ts`
  - *Purpose:* EXELMJ RTL data-validation dropdown.  Proven on the packaged app with two files identical except for the sheet's rightToLeft flag: with the flag OFF Univer's own list dropdown opens on the first click (literal lists AND range-sourced ones); with it ON it never opens at ANY point of the cell — although the chip is drawn, the rule is loaded and hovering it still switches the cursor to a pointer (so the rule, the widget and its hit-test are all fine). The cell-anchored popup layer works under the mirror too — the column filter menu opens correctly — so what breaks is Univer's pointer-down → show-dropdown path inside the flipped host.  Rather than fight the engine, RTL sheets get their own list: a plain DOM popup appended to <body>, i.e. OUTSIDE the mirrored host, so it is never flipped (the same rule the editor overlay follows). It opens on a click on a cell carrying a `list` rule and writes the picked value through the facade.. Defines: parseListOptions, rangeOptions, optionsForCell. Uses: univerjs/presets, /rtlMirror.
  - *Last Modified:* 2026-08-10

- 🗂️ `src/univer/rtlEditor.ts`
  - *Purpose:* EXELMJ RTL cell-editing overlay.  Univer 0.25.1's doc canvas editor has NO Unicode Bidi Algorithm: its shaper (ArabicHandler) naively REVERSES each Arabic run and lays runs out left-to- right; `paragraph.direction` / `section.contentDirection` are stored but ignored by layout (verified in the engine source and by live pixel/x-probe). So typing Arabic — and especially MIXED Arabic+Latin+digits — inside a cell shows garbled, back-to-front, left-flowing text, even though the committed GRID (which draws each cell as one browser-bidi fillText) looks correct.  Fix: while an RTL sheet's TEXT cell is being edited, cover Univer's canvas editor with a native <textarea dir="auto"; unicode-bidi:plaintext>. The browser does full, correct bidi + Arabic shaping + caret + right-to-left flow during editing. On commit we write the plain LOGICAL string to the cell via the facade (which parses numbers and formulas), and the grid renders it.. Defines: rtlSheet, cellEditorCanvas, editorLogicalText, activeCell. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/univer/rtlMirror.ts`
  - *Purpose:* EXELMJ RTL Mirror — renderer-level right-to-left sheets (column A on the RIGHT), which upstream Univer 0.25.1 does not ship (its renderer ignores worksheet.rightToLeft; verified in code, release notes and by pixel probe).  Mechanism, proven piece-by-piece in live experiments: 1. CSS scaleX(-1) on the sheet render host: geometry, headers, selections and overlays all mirror. The browser maps pointer coordinates through CSS transforms automatically, so hit-testing keeps working un-remapped. 2. Canvas text counter-flip: fillText/strokeText mirror each run around its own CENTER (stays inside its cell box), so after the CSS flip text reads normally. Scoped to canvases INSIDE the host — the formula bar canvas lives outside and must stay untouched. 3. drawImage counter-flip for picture sources only (HTMLImageElement / ImageBitmap) so photos aren't mirror-imaged; canvas-to-canvas blits pass through untouched.. Defines: setHindiDigits, isRtlMirrorActive, findHost, inHost. Uses: univerjs/presets.
  - *Last Modified:* 2026-08-13

- 🗂️ `src/univer/setup.ts`
  - *Purpose:* المكان الوحيد لإعداد محرك Univer: تسجيل الحزم العشر المجانية + لغتي en-US/ar-SA + قائمة خطوط النظام customFontFamily (≤300) + تسجيل أمر اتجاه الورقة يدوياً. محدث 2026-07-18: حقن CSS بخاصية content-visibility:auto لأزرار معاينة الخطوط كي تفتح قائمة الخطوط فوراً وتُحمَّل الخطوط عند التمرير فقط (علاج بطء فتح القائمة مع 300 خط).
  - *Last Modified:* 2026-07-17

- 🗂️ `src/univer/touchSheet.ts`
  - *Purpose:* Touch gestures for the Univer sheet grid (desktop UI has none: a swipe selected cells). Window-capture listeners take TOUCH pointers on the sheet canvas before Univer; a pure, unit-tested TouchGestureTracker turns them into swipe→scroll (sheet.command.set-scroll-relative, divided by zoom, x flipped on the mirrored RTL grid, axis lock, fling inertia), pinch→FWorksheet.zoom (0.5–3), tap→synthetic mouse click, double-tap→second click replayed at the first tap's point (Univer's own double-click needs ≤2 px) + dblclick, long-press+drag→synthetic mouse drag range select, long-press+lift→synthetic right-button press (cell context menu). Browser echoes (trusted click/dblclick/contextmenu from touch) are swallowed. Frames via nextFrame = rAF or 50 ms timer, whichever first. Mouse/pen untouched.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/entry.ts`
  - *Purpose:* EXELMJ web edition entry.  Imports run in order: the browser bridge installs window.exelmj first, then the very same app as the desktop boots on top of it.. Uses: /phoneLayout, /webBridge, ./main.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/index.html`
  - *Purpose:* Web edition HTML (root of vite.web.config.ts): hosts #app and #word-app only, ar/rtl by default, viewport with interactive-widget=resizes-content (Android keyboard resizes the page), theme colour, manifest and icon links, loads ./entry.ts.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/phoneLayout.ts`
  - *Purpose:* Phone layout for the web edition. The web build loads this (entry.ts); the desktop app never does. Everything sits under one media query, so tablets and wider screens keep the desktop layout.  Under 768 px wide: - Both pages start below a 40 px app bar that holds the mode pill, the file name and the menu button (webShell builds it). Nothing of Univer's header or the Word ribbon hides under the pill any more. - Documents ribbon: its tab row and its groups get the full width, and the groups scroll sideways with a finger. Their dropdowns (colours, styles, table grid, the File panel) open as a sheet at the bottom of the screen, because an overlay inside a sideways-scrolling strip would be clipped. Buttons get touch size. - Documents page: the text reflows to the screen width with small margins, like Word's mobile view. Only the DISPLAY changes — the document's page. Defines: installPhoneLayout.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/public/manifest.webmanifest`
  - *Purpose:* Public/static files served directly
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/sw.js`
  - *Purpose:* EXELMJ web edition: the offline service worker. The web build (vite.web.config.ts) writes the real dist/web/sw.js from this file, filling in VERSION (a hash of every built file) and ASSETS (every built file). A version is cached whole when it installs. The next deploy installs beside it and takes over only once every window of the app is closed, so a running app never mixes files from two versions..
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/webBridge.ts`
  - *Purpose:* The window.exelmj bridge for the web edition.  On the desktop, window.exelmj is Electron's preload bridge (files, dialogs, printing, autosave on disk). The sheet and document code only ever talks to that bridge, so the web edition runs the SAME app by giving it this bridge instead — built on browser APIs (see webFiles and webStore). Only the members the Sheets and Documents pages use are implemented; everything Studio/Design/Illustrator-specific is absent, and those pages are not in the web build. This module installs itself when imported (src/web/entry.ts imports it before the app).. Defines: SavedCopy type, WebLang type, MenuHandler type, printHtml, createWebBridge. Uses: ./word, ./i18n, /webFiles, /webStore, /webShell.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/webFiles.ts`
  - *Purpose:* Web edition file I/O: pure unit-tested helpers (docFileType MIME/kind by name, OPEN_EXTENSIONS xlsx/xlsm/csv/docx, extensionForKind, safeFileName, makeWebPath/parseWebPath, upsertRecent newest-first dedupe-by-name cap) and DOM helpers — pickFile (showOpenFilePicker or <input type=file>), writeToHandle (permission + createWritable), downloadBytes, canShareFiles/shareBytes (Web Share files), saveBytesAs (showSaveFilePicker else download/share chooser).
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/webShell.ts`
  - *Purpose:* The web edition's menu: the desktop app's native menu bar, as a side drawer.  A phone has no menu bar, so this drawer carries the same entries as electron/menu.ts and fires the SAME action names through the app's one onMenu dispatcher in src/main.ts — nothing is re-implemented, only the way in. Sheet-only sections hide while the Documents page is showing (the dispatcher ignores them there anyway). Electron-only items (new window, exit, dev tools, window zoom) have no place here.  Lives on <body>, outside the mirrored sheet host (house rule for anything interactive while RTL sheets are mirrored).. Defines: Dispatch type, ShellHooks type, Item type, Section type, InstallPrompt type. Methods: recent(), openRecent(), setLanguage(), hindiDigits(), setHindiDigits(). Uses: ./i18n, ./word, /webStore.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/web/webStore.ts`
  - *Purpose:* Web edition storage: settings (language default Arabic when the phone lists any ar locale, hindiDigits) in localStorage; IndexedDB 'exelmj-web' with a kv store (autosave:sheet / autosave:word) and a recent store (file bytes + optional File System Access handle, max 8, trimmed with upsertRecent).
  - *Last Modified:* 2026-09-25

- 🗂️ `src/word/askForm.ts`
  - *Purpose:* A small in-app modal form for the word mode.  WHY THIS EXISTS: Electron refuses window.prompt() outright ("prompt() is and will not be supported") — the link button used it and simply threw, so the button did nothing at all. Everything that needs to ask the user for a value (link target, header/footer text, page setup) goes through this instead.  Like the mode pill, it is appended to <body> — outside any mirrored host — so it is never flipped by the RTL sheet mirror.. Defines: FieldType type, FormField type, FormOptions type, FormResult type, askForm. Uses: ./i18n.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/commentPane.ts`
  - *Purpose:* The comment gutter: cards in the page margin, each lined up with the text it is pinned to.  The side matters. Word puts the balloons in the margin the text does NOT start from — the left one for an Arabic document — and putting them on the wrong side is the tell that a program was translated rather than built for Arabic.. Defines: CommentPane class, AnchoredThread type, CommentThread type, CommentPaneHooks type. Methods: activate(), reply(), resolve(), remove(), edit(), setLang(). Uses: ./i18n, /comments.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/comments.ts`
  - *Purpose:* Comments — تعليقات: a note pinned to a range of text, with replies, the way a memo or a set of minutes gets reviewed before it goes out.  The anchoring is a mark on the text (see @sereneinserenade/tiptap-comment- extension); this file owns everything else — the threads themselves, their order down the page, and the trip through .docx so a reviewer can open the file in Word and see the same notes.. Defines: CommentReply type, CommentThread type, AnchoredThread type, FlatComment type, newThreadId.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/direction.ts`
  - *Purpose:* Per-paragraph direction for the word editor: an explicit `dir` attribute on paragraphs and headings (the attribute the docx exporter reads — explicit per-node dir is the pattern that survives serialization and maps 1:1 to w:bidi). The editor ROOT carries the document default dir; this attribute is only set when a paragraph deviates or was imported with a direction.. Defines: Commands type, the type. Methods: addGlobalAttributes(), addCommands(). Uses: tiptap/core.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/dirtyMux.ts`
  - *Purpose:* Main keeps ONE global dirty flag (the close-guard input). Two renderer documents feed it now — the sheet workbook and the word document — so this mux ORs the two before talking to the bridge. DocController reports through reportSheetDirty; the word module through reportWordDirty.. Defines: push, reportSheetDirty, reportWordDirty, reportDesignDirty, isSheetDirty.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/docxExport.ts`
  - *Purpose:* EXELMJ docx exporter — TipTap JSON → .docx bytes via the `docx` library.  Arabic-correctness rules (verified against OOXML docs + docx#3419): - Every RTL paragraph gets BOTH `bidirectional: true` (w:bidi) AND an explicit `alignment` — bidirectional alone leaves text stuck LEFT in Word. - Physical editor alignment maps to LOGICAL jc: rtl+right → START, rtl+left → END (and mirrored for LTR), center/justify pass through. That round-trips with the importer without ever flipping sides. - Runs containing Arabic get `rightToLeft: true` (w:rtl), and bold/italic/ size are emitted with their complex-script mirrors (w:bCs/w:iCs/w:szCs) — without those Word applies the format to Latin text only. - Tables in an RTL document get `visuallyRightToLeft`.. Defines: CommentThread type, PageSetup type, TipTapNode type, alignForExport. Uses: docx, /comments, /pageSetup.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/docxImport.ts`
  - *Purpose:* EXELMJ docx importer — .docx bytes → HTML for the TipTap editor.  Written in-house (same precedent as src/xlsx/): the popular converters are unusable for Arabic — mammoth deliberately drops alignment, direction, fonts and colors (a right-aligned RTL paragraph comes out as a bare LTR <p>), and docx-preview is read-only. This importer keeps exactly what the editor models: paragraphs/headings with LOGICAL alignment + direction, run formatting (incl. the complex-script mirrors Word uses for Arabic), lists, tables, and embedded images.  OOXML bidi rules honored here (see PROJECT_MAP): - w:bidi (paragraph) flips paragraph geometry; w:jc start/end are LOGICAL: start = RIGHT in an RTL paragraph, LEFT in LTR. left/right/center are physical. We resolve to a physical text-align for display but keep dir as its own attribute, so exporting maps back to logical start/end losslessly.. Defines: PageSetup type, DocxImportResult type, XNode type, tagName, children. Uses: jszip, /comments, fast-xml-parser, /pageSetup.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/findReplace.ts`
  - *Purpose:* Find &amp; replace for the word document: a ProseMirror plugin owning the match list and highlight decorations, plus the FindBar docked under the ribbon (Ctrl+F/Ctrl+H, step, replace, replace all, match case, live counter). Matching runs over a FLATTENED document string with a   separator at every block boundary, so a phrase still matches when part of it is bold/coloured/linked but never spans two paragraphs. Defines: FindReplace extension, FindBar, findMatches, flattenDoc, findKey.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/fonts.ts`
  - *Purpose:* Which installed faces a font picker may offer.  Windows reports hidden system entries (". Semi", "@Batang") and, on this machine, one blank name. None of them are valid CSS identifiers, so picking one wrote `font-family: . Semi` — a declaration the CSS parser drops, making the picker look broken. They are filtered out at the source, which keeps both the sheet's picker and the word ribbon honest.  Its own module (not ribbon.ts) so main.ts can use it without pulling the whole word bundle into the first paint.. Defines: usableFonts.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/icons.ts`
  - *Purpose:* Ribbon icons — Fluent UI System Icons (c) Microsoft Corporation, MIT license. The last sixteen (find … formatPainter) are drawn in-house on the same 20x20 grid: Fluent has no match for the page/table controls this ribbon needs. Source: https://github.com/microsoft/fluentui-system-icons (@fluentui/svg-icons)..
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/lineHeight.ts`
  - *Purpose:* Per-paragraph line spacing.  TipTap's own LineHeight (inside TextStyleKit) is a TEXT-STYLE mark: it needs a selection and wraps the selected words in a <span style="line-height">, which means a caret sitting in a paragraph did nothing at all — the exact complaint from the QA pass, and not how Word behaves. Here it is a paragraph attribute instead (same shape as Direction), so putting the caret anywhere in the paragraph and picking a value re-spaces the WHOLE paragraph, and the value survives the docx round-trip through w:spacing/@w:line.. Defines: Commands type. Methods: addGlobalAttributes(), addCommands(). Uses: tiptap/core.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/mailMerge.ts`
  - *Purpose:* Mail merge — دمج المراسلات: one letter plus a list of names becomes a letter for every name.  The merge happens in the editor's own document, not in the OOXML: the fields are real nodes in the ProseMirror tree, so a merged run is just the document cloned once per record with every field node swapped for its text. That keeps one code path for the screen, the printer, the PDF and the .docx.. Defines: MergeSource type, MergeFormat type, MergeFieldAttrs type, TipTapNode type, MergeContext type. Uses: /tafqit, ./univer.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/mergeField.ts`
  - *Purpose:* The merge-field node: an inline chip like «اسم العميل» that stands in for a value until the merge runs.  It is an atom, so the caret steps over it as one thing and the user cannot half-delete a field into a broken name. On export it becomes a real Word MERGEFIELD, so an unmerged .docx still opens as a merge document in Word.. Defines: MergeFieldAttrs type, Commands type. Methods: addAttributes(), parseHTML(), renderHTML(), renderText(), addCommands(). Uses: tiptap/core, /mailMerge.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/modeToggle.ts`
  - *Purpose:* The mode switch the manager asked for: a rounded sliding pill, fixed at the window's top corner, flipping between the app's tools — the sheet app (#app / Univer), the word app (#word-app / TipTap), the design app (#design-app / artwork overlay) and the photo app (#photo-app / layers). The knob slides with an eased transform; the active label is highlighted. Lives on <body>, outside the mirrored sheet host (house rule for anything interactive while RTL sheets are mirrored).. Defines: AppMode type, currentMode, initModeToggle, setMode. Uses: ./i18n.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/word/pageSetup.ts`
  - *Purpose:* Page setup for the word document: paper size, orientation, margins and the header/footer that repeat on every printed page.  One model, four consumers — the on-screen sheet (width + padding), the page guides drawn over it, the print/PDF stylesheet, and the docx section properties. Keeping the numbers in millimetres here means the docx twips and the CSS pixels are both derived, never guessed in two places.. Defines: PaperSize type, Orientation type, Margins type, PageSetup type, defaultPageSetup.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/pdfLayout.ts`
  - *Purpose:* The geometry half of the PDF import: runs at coordinates → document HTML.  Kept apart from pdfToDoc.ts so the rules can be unit-tested without loading pdfjs (which only resolves inside the bundler).  A PDF has no paragraphs, only glyph runs at coordinates, so the structure is REBUILT: runs group into lines, lines into paragraphs, and the page geometry is read back as headings, alignment, direction, lists and simple tables.  FIDELITY FIRST: every run keeps the size, family, weight and colour it had in the file. Structure tags (h1…h4, ul/ol, table) are added on top of that, never instead of it — a heading still carries its exact point size, so the rebuilt page reads the same as the original instead of being re-styled by the editor's own stylesheet.. Defines: PdfRun type, PdfImage type, PageBox type, PdfRule type, LayoutOptions type.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/pdfToDoc.ts`
  - *Purpose:* PDF → editable document.  Word can open a PDF and hand back something you can retype; this is the same idea for the Documents page. A PDF has no paragraphs — only glyph runs at coordinates — so the structure is REBUILT (see ./pdfLayout), and everything that makes the page LOOK like itself is carried across with it:  * every run keeps its point size and font family, * its ink colour is sampled from the rendered page (a PDF's text operators do not carry a colour the text layer can read), * pictures are cropped out of that same render at the boxes the operator list paints them in, so masks, CMYK JPEGs and clipping all come out right without decoding a single image object by hand, * the paper size, orientation and margins are taken from the file, so the rebuilt document breaks lines where the original did.. Defines: ExtractedText type, ImageRect type, PdfImage type, PdfRun type, PdfImportResult type. Uses: ./design, /pdfLayout, /pageSetup.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/printDoc.ts`
  - *Purpose:* Print HTML for the word document: the editor's HTML wrapped in a standalone page whose @page block carries the user's paper size, orientation and margins (body padding would only apply to the first page). Printed through the hidden-window 'print:html' channel with preferCSSPageSize so Chromium honors the @page block.  The header/footer text is NOT in this HTML: it is handed to Chromium's own header/footer band (printToPDF templates / print options), which is the only place a live page number can be produced.. Defines: PageSetup type, html type, buildDocPrintHtml, promoteHeaderRows. Uses: ./i18n, /pageSetup.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/ribbon.ts`
  - *Purpose:* EXELMJ Word-mode ribbon — an in-house, RTL-first Word-style ribbon.  Own code throughout. The layout follows the classic ribbon PATTERN (tab row, grouped controls with a label strip, table hover-grid picker, status-bar zoom) which is a functional UI method, studied from open-source references (ONLYOFFICE/LibreOffice ribbons — looked at, never copied) — see PROJECT_MAP. Icons are Microsoft's Fluent UI System Icons (MIT) inlined in icons.ts. No Office assets, no trademarks.. Defines: RibbonActions type, RibbonHandles type. Methods: newDoc(), open(), save(), saveAs(), print(), exportPdf(). Uses: ./i18n, /fonts, /icons.
  - *Last Modified:* 2026-09-07

- 🗂️ `src/word/tableBorders.ts`
  - *Purpose:* Whether a table draws its grid.  A converted PDF needs both kinds: a bank statement's transaction table IS ruled in the file, while the "Bank: … Page: …" header only LINES UP — the columns are real, the borders are not. Inventing a grid around the second one is exactly what made a converted page stop looking like its original, so the importer marks what the file actually draws.  The flag lives on the CELLS, not on the table: with resizable tables TipTap renders the <table> through its own node view, which ignores attributes added here — cells still go through renderHTML, so that is where it sticks.. Defines: Commands type. Methods: addGlobalAttributes(), addCommands(). Uses: tiptap/core.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/tableOffice.ts`
  - *Purpose:* The table jobs an office actually does: turn a pasted list into a table, turn a table back into text, and total a column.  The number parsing is the fiddly part: an Arabic office writes ١٢٣٤ as often as 1234, uses both , and ٬ for thousands, and both . and ٫ for the decimal mark — and a total that silently ignores half the rows is worse than no total at all.. Defines: Separator type, parseNumber, formatLike, decimalsOf, textToRows.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/tableShading.ts`
  - *Purpose:* Cell background colour for word tables.  TipTap's table cells carry only colspan/rowspan/colwidth, so shading needs its own global attribute. Kept as a plain hex string on the cell node: the editor renders it inline, the exporter maps it to w:shd/@w:fill and the importer reads that back, so a shaded header row survives a round trip.  The command goes through prosemirror-tables' own rectangle rather than commands.updateAttributes: with a plain caret (no cell selection) that helper does not reach the enclosing cell, so clicking the paint button after simply typing in a cell did nothing. Word shades the SELECTED cells, or the one holding the cursor — this does the same.. Defines: Commands type. Methods: addGlobalAttributes(), addCommands(). Uses: tiptap/core, tiptap/pm.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/tableTools.ts`
  - *Purpose:* Word-style table handles for the document editor.  Word gives a table three affordances the plain editor lacks: a strip above every column and beside every row that SELECTS it on click, a small ✛ at the corner that selects the whole table, and a ⊕ at each boundary that inserts a column/row exactly there. This draws all three as an overlay on top of the sheet (never inside the contenteditable, so ProseMirror's document is never polluted) and drives them through prosemirror-tables' own CellSelection.  RTL-aware throughout: geometry comes from getBoundingClientRect, so a mirrored table needs no special casing — the row strip simply lands on the visual start edge.. Defines: TableTools class. Methods: attach(), refresh(). Uses: tiptap/core, tiptap/pm, ./i18n.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/tafqit.ts`
  - *Purpose:* Numbers written out in Arabic words — تفقيط — for quotations, invoices and cheques, where the amount has to appear twice: once in digits and once in words that cannot be altered afterwards.  The conversion itself is a port of Mohsen Alyafei's `tafqit` (MIT, v1.60, https://github.com/MohsenAlyafei/tafqit): the counted-noun grammar is the hard part — ريال / ريالان / ريالات / ريالاً all appear depending on the number in front of them, and getting it wrong is what makes a written amount look forged. The port keeps the original algorithm; the currency table and the amount wrapper below are ours.. Defines: TafqitOptions type, tafqit.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/templates.ts`
  - *Purpose:* Ready-made documents for the work that actually comes up in an office: a letter that goes out on company paper, a quotation with a totals table, the minutes of a meeting, and an internal memo.  Each template is plain editor HTML — the same shape the docx importer produces — so a template opens as an ordinary document with nothing special about it, and the date is filled in on the day it is used.. Defines: DocTemplate type, today, p, h, row. Uses: ./i18n.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/word/wordApp.ts`
  - *Purpose:* EXELMJ Word mode — a Word-like docx editor living beside the sheet app.  The editor is TipTap (ProseMirror): a native contenteditable, so the BROWSER does Arabic bidi/shaping/caret — the exact property Univer's canvas engine lacks (which is why the sheet side needed the whole rtlMirror apparatus). The word container sits OUTSIDE the mirrored sheet host and is never affected by it.  File I/O goes through the existing bridge: readFile/saveFile/saveFileAs handle raw bytes for any extension; printing reuses the hidden-window 'print:html' channel with @page A4 + preferCSSPageSize.. Defines: TipTapNode type, AnchoredThread type, CommentThread type, MergeFieldAttrs type, MergeSource type. Uses: tiptap/core, tiptap/starter-kit, tiptap/extension-text-align, tiptap/extension-text-style, tiptap/extension-highlight.
  - *Last Modified:* 2026-09-25

- 🗂️ `src/word/wordExtras.ts`
  - *Purpose:* The Word features the QA pass found missing from the Documents page, each small enough to live together: a real page break, superscript/subscript, and paragraph spacing before/after.  All three round-trip through docx (w:br type="page", w:vertAlign, and w:spacing @w:before/@w:after), so a document that uses them still looks the same after a save and reopen in Word.. Defines: Commands type. Methods: parseHTML(), renderHTML(), addCommands(), addKeyboardShortcuts(). Uses: tiptap/core.
  - *Last Modified:* 2026-08-18

- 🗂️ `src/xlsx/chartMeta.ts`
  - *Purpose:* بيانات EXELMJ الوصفية داخل ورقة veryHidden مخفية (_EXELMJ_META) لضمان ملف واحد. الحمولة v3: الرسوم + تعريفات الجداول المحورية (الأوراق بفهرس الترتيب) + معرّفات أوراق Univer الأصلية + موارد التمرير التي لا يفهمها اكسل. writeMeta/readMeta مع تقسيم 30000 حرف؛ البيفوت يُسقَط إن اختفت ورقة مصدره أو هدفه. محدث 2026-07-23: إضافة حقل pivots (StoredPivot بفهرسي source/target) ورفع الإصدار إلى 3.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/xlsx/csv.ts`
  - *Purpose:* Own CSV engine (browser-safe): delimiter autodetect (, ; tab), quoted-field parser, windows-1256 fallback decoding for legacy Arabic files, numeric detection into IWorkbookData, sheet→CSV serializer with UTF-8 BOM.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/xlsx/exportXlsx.ts`
  - *Purpose:* exports Univer IWorkbookData snapshots to XLSX bytes using ExcelJS, ensuring formulas recalculate on load.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/xlsx/fidelityShield.ts`
  - *Purpose:* Zip-level merge re-injecting foreign-file parts our pipeline doesn't model into every export: vbaProject.bin (+macroEnabled CT), pivotTable/pivotCache chains, per-sheet native drawing/chart chains; sheets matched by name; conflicts and drops reported via FidelityReport.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/xlsx/importXlsx.ts`
  - *Purpose:* converts XLSX byte data from ExcelJS into a Univer IWorkbookData snapshot, handling cell values, formulas, and styles.
  - *Last Modified:* 2026-07-23

- 🗂️ `src/xlsx/notesParser.ts`
  - *Purpose:* Parses XLSX files to extract cell notes directly from the zip archive.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/xlsx/resourceMap.ts`
  - *Purpose:* maps Univer plugin resources like filters, data validation, and conditional formatting to and from ExcelJS formats.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/xlsx/styleMap.ts`
  - *Purpose:* provides bidirectional mapping and conversion utilities for styles and geometry between ExcelJS and Univer spreadsheet models.
  - *Last Modified:* 2026-07-17

- 🗂️ `src/xlsx/zipUtils.ts`
  - *Purpose:* Shared xlsx-zip helpers: attr/rels parsing, target resolution (relative paths), rels path derivation, worksheet parts in workbook order with names, XML fragment insertion, unescapeXml — used by notesParser and fidelityShield.
  - *Last Modified:* 2026-07-17

## 📁 tests

- 🗂️ `tests/align.test.ts`
  - *Purpose:* Defines: Positioned type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/appearance.test.ts`
  - *Purpose:* Shadow, dash and corner radius — the appearance fields.  Same contract as every other v4 field: absent at its default, so a document that never used one still writes version 3 and stays readable by v0.3.0.. Defines: Shape type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/browserPolicy.test.ts`
  - *Purpose:* The URL policy of the embedded browser, tested without Electron.  canLoad is the gate between "our own preview" and "the open web", so it is the one piece of browserView.ts that must be provable in isolation. The WebContentsView plumbing around it needs a real window; this does not.. Uses: vitest, ./electron.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/bundle.test.ts`
  - *Purpose:* Defines: input. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/captureImport.test.ts`
  - *Purpose:* Defines: Capture type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/colorSystem.test.ts`
  - *Purpose:* Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/compound.test.ts`
  - *Purpose:* Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/contextMenu.test.ts`
  - *Purpose:* The right-click menu: every entry live exactly when its action can run.  "تأكد من انها فعالة" — make sure they actually work. An entry that is enabled while its action refuses to run is what makes a menu untrustworthy, so each rule below is stated against the behaviour it has to match.. Defines: MenuAction type, MenuEntry type, MenuState type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/csv.test.ts`
  - *Purpose:* اختبار وظائف معالجة وتحويل ملفات CSV، بما في ذلك الكشف عن الفواصل ودعم اللغة العربية.
  - *Last Modified:* 2026-07-17

- 🗂️ `tests/design.test.ts`
  - *Purpose:* Defines: RGB type. Uses: vitest, ./src, node:fs.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/designBoolean.test.ts`
  - *Purpose:* Unit tests for src/design/boolean.ts (moved from tests/vectorBoolean.test.ts): union/subtract/intersect/exclude correctness on hand-verifiable overlapping/disjoint rectangles via shoelace area.
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/designV4.test.ts`
  - *Purpose:* Defines: Shape type, PlacedImage type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/docDirty.test.ts`
  - *Purpose:* Regression tests for the sheet's unsaved flag: drives DocController's real CommandExecuted listener through a stand-in facade (window/document stubbed). Recalculated formula values written back (sheet.mutation.set-range-values with options.fromFormula) and formula.*/doc.*/non-mutation events keep the file clean; a real set-range-values edit marks it unsaved, stars the title and reports setDirty(true). Guards bug 86c2d169 (file with formulas opened at launch showed "*").
  - *Last Modified:* 2026-09-25

- 🗂️ `tests/docSetup.test.ts`
  - *Purpose:* New-document units, resolution and colour mode.  The two conversions worth a test suite of their own: a pixel has no size until a resolution is chosen, and a millimetre has one that never depends on the resolution. Confusing the two is what makes a 300dpi A4 come out four times too big.. Defines: DocSetup type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/docx.test.ts`
  - *Purpose:* Defines: TipTapNode type. Uses: vitest, jszip, ./src, docx.
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/expand.test.ts`
  - *Purpose:* Expand, and the geometry it stands on.  The owner's report: small elements are hard to control, icons cannot be enlarged, and there is no way to turn a stroked object into flat artwork. The first two are the grip ring and the group transform; the third is shapeToPathD + dashPathD feeding outlineStroke.. Defines: Shape type, Box type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-15

- 🗂️ `tests/fidelity.test.ts`
  - *Purpose:* Fidelity shield suite: handcrafted foreign xlsm (pivot+chart+vba) survives open→edit→save with references patched and exceljs able to reload; image-conflict keeps EXELMJ drawing; renamed sheet drops parts gracefully.
  - *Last Modified:* 2026-07-17

- 🗂️ `tests/findAllSheets.test.ts`
  - *Purpose:* Unit tests for findAllSheets.ts helpers: grouping find matches by sheet (tab order, counts, first cell, hidden/deleted sheets dropped) and the English/Arabic "found in N sheets" wording (singular, dual, 3-10, 11+).
  - *Last Modified:* 2026-09-25

- 🗂️ `tests/group.test.ts`
  - *Purpose:* Scaling and rotating a SELECTION.  This is the maths behind the owner's "icons cannot be enlarged": an icon is several separate runs, so enlarging it is a group operation, and there was no group operation.. Defines: Box type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/grouping.test.ts`
  - *Purpose:* Grouping: the set arithmetic behind "these belong together".. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/handles.test.ts`
  - *Purpose:* Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/hijri.test.ts`
  - *Purpose:* اختبار تحويل التواريخ الهجرية إلى صيغ نصية ورقمية.
  - *Last Modified:* 2026-07-17

- 🗂️ `tests/htmlExport.test.ts`
  - *Purpose:* The design as HTML and CSS.  This is what a motion rule attaches to, so the two things that matter most are that a class is STABLE (a rule written last week still points at the same element) and that positions are LOGICAL (an Arabic page mirrors).. Defines: is class, cannot class, HtmlInput type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-15

- 🗂️ `tests/icon.test.ts`
  - *Purpose:* Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/iconLibrary.test.ts`
  - *Purpose:* The bundled icon library is REDISTRIBUTED ARTWORK, so its provenance is asserted here rather than trusted. If this file ever fails, do not "fix" the test — find out what changed in the extraction.. Uses: vitest, ./resources, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/layout.test.ts`
  - *Purpose:* Defines: LayoutChild type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/layoutApply.test.ts`
  - *Purpose:* The contract that makes frames cheap: layout RESOLVES TO ABSOLUTE POINTS.  Every exporter in src/design (PDF, SVG, PNG, Word) iterates the flat arrays and knows nothing about frames. That is only safe if running a layout leaves those arrays holding plain coordinates. These tests pin exactly that, using the same layoutFrame + applyBoxToShape pair designApp uses.. Defines: LayoutChild type, Shape type, apply. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/mailMerge.test.ts`
  - *Purpose:* Mail merge: one letter plus a list becomes a letter per person. The document is cloned per record and every field node swapped for its text, so what the screen shows, what prints and what lands in the .docx are the same thing.. Defines: TipTapNode type, TipTapNode type. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/mainProcessSafety.test.ts`
  - *Purpose:* A guard against the class of bug that crashed the packaged app: touching a BrowserWindow's NATIVE side after it has been destroyed.  Electron fires 'closed' AFTER the window is gone. Reading `w.webContents` (or `.contentView`, or any other native accessor) inside that handler throws "TypeError: Object has been destroyed", and an uncaught throw in the main process is a crash DIALOG, not a log line — the user sees the app die.  This cannot be caught by a unit test of behaviour, because it needs a real Electron window. So it is caught by reading the source: the rule is simple enough to check statically, and a rule that is checked is a rule that holds.. Defines: of class, closedHandlers. Uses: vitest, node:fs.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/marquee.test.ts`
  - *Purpose:* Defines: Selectable type, TextBox type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/mcpHandlers.test.ts`
  - *Purpose:* Defines: DocumentView type, Result type, doc, view. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/mcpLive.test.ts`
  - *Purpose:* A REAL server, over a REAL socket. The dispatch tests prove the protocol logic; these prove the thing a client actually connects to — the bind address, the auth gate, the body limit and the notification behaviour. Those are exactly the parts that cannot be checked by calling a function.. Defines: RunningServer type, rpc. Uses: vitest, node:fs/promises, node:os, node:path, ./electron.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/mcpServer.test.ts`
  - *Purpose:* Defines: McpHost type. Uses: vitest, ./electron.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/motion.test.ts`
  - *Purpose:* The interaction model and the compiler that turns it into a stylesheet.  The compiler is the piece written from scratch instead of imported, so it carries the whole weight: if it emits CSS that a browser will not run, or that composes two changes into a fight, there is no library underneath to have got it right.. Defines: Interaction type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-15

- 🗂️ `tests/oklab.test.ts`
  - *Purpose:* Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/outline.test.ts`
  - *Purpose:* Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/path.test.ts`
  - *Purpose:* Defines: Seg type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/pathKernel.test.ts`
  - *Purpose:* The contract between the tracer and the path kernel.  M2's whole premise is that EVERY path in the app is absolute M/L/C/Z by the time anything downstream sees it. That is only true if the tracer's real output — not a hand-written sample — actually survives normalize(). These tests run the real ringToPath/traceImage output through the kernel.. Defines: twoSquares. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/pdfArabic.test.ts`
  - *Purpose:* Arabic coming out of a real PDF: Chromium writes one glyph per text item, in visual order, using presentation forms — so the importer has to stitch the letters back into words, put the words back in reading order, and map the presentation forms to real Arabic. The fixtures below are the actual coordinates pdf.js reports for a printed Arabic statement, to the centimetre.. Defines: ExtractedText type, PdfRun type, glyph, toRuns. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/photoAdjustments.test.ts`
  - *Purpose:* Unit tests for src/photo/adjustments.ts: identity at neutral params, directional checks for brightness/contrast/hue/saturation/lightness/levels, alpha/transparent-pixel handling.
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/photoCompositor.test.ts`
  - *Purpose:* Unit tests for src/photo/compositor.ts: blend-mode formulas (separable + the W3C non-separable luminosity invariant), alpha-compositing arithmetic, and IncrementalCompositor's recompute-count behaviour (top-layer edit recomposites 1 layer, bottom-layer edit recomposites the whole stack).
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/photoModel.test.ts`
  - *Purpose:* Unit tests for src/photo/model.ts: layer CRUD never mutates the input document, crop repositions/resizes every layer correctly.
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/pivot.test.ts`
  - *Purpose:* يختبر هذا الملف وظائف محرك الجداول المحورية، بما في ذلك التجميع والجمع والإجماليات لأنواع مختلفة من البيانات.
  - *Last Modified:* 2026-07-23

- 🗂️ `tests/render.test.ts`
  - *Purpose:* How a shape reaches the screen: its paint, its transform, its shadow region.  Every case here is a bug the user actually hit. They are unit tests rather than DOM tests because the decisions were extracted OUT of the renderer for exactly that reason — the renderer needs a browser, the decisions do not.. Defines: Shape type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/rtlAlign.test.ts`
  - *Purpose:* Uses: vitest, ./src.
  - *Last Modified:* 2026-08-10

- 🗂️ `tests/split.test.ts`
  - *Purpose:* Splitting an object into the pieces it is visibly made of.  The owner's case, exactly: an icon of three bars that never touch. Because they are disconnected they ARE three objects, and the app has to be able to say so — merging icon runs on insert is what makes the icon usable as one thing, and this is the way back out.. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/stubs/pdfWorker.ts`
  - *Purpose:* Vite turns `?worker&inline` into a Worker constructor; node has no such loader, so the tests swap in this stub. Nothing here is ever constructed — the PDF layer's pure functions (run merging, geometry) are what get tested.. Defines: StubWorker class. Methods: terminate().
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/studioDelivery.test.ts`
  - *Purpose:* Defines: HandoffInput type. Uses: vitest, ./src, ./electron.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/studioProtocol.test.ts`
  - *Purpose:* The security boundary of the studio:// scheme.  The guest can request any path it likes; resolveStudioPath is the only thing between that and the user's filesystem. These tests are the ones that would matter most if they were missing.. Uses: vitest, node:path, ./electron.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/tafqit.test.ts`
  - *Purpose:* Amounts written out in Arabic. The grammar is the whole point: the counted noun changes shape with the number in front of it, and a quotation that says "ثلاثة ريال" instead of "ثلاثة ريالات" looks like it was typed by a machine.. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/template.test.ts`
  - *Purpose:* Defines: Selection type, ComponentDef type, StudioDoc type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/touchSheet.test.ts`
  - *Purpose:* Unit tests for touchSheet.ts: TouchGestureTracker (tap, double-tap reported at the first tap's point, slow taps stay separate, pan distance exact, vertical axis lock, fling vs rested finger, pinch scale and finger-lift handling, long-press start/drag/lift, cancel) and panToScroll/clampZoom (direction, RTL mirror flip, zoom division, zoom range).
  - *Last Modified:* 2026-09-25

- 🗂️ `tests/traceParity.test.ts`
  - *Purpose:* The tracer must keep doing exactly what it does today.  "حافظ على ما يفعله الترييس الان" — the working engine was copied to backups/trace-working-2026-08-14/ and this suite runs BOTH: the frozen copy and the live one, on the same pictures, and requires their SVG to match character for character.  That is what makes the speed work safe. The stacked-fields engine and the 200-colour palette changed how much the tracer costs, never what it draws, and this is the proof — not a claim. It also pins the backup in place: it cannot be deleted without the suite going red, which is the restore point the whole change was asked to preserve.. Defines: picture. Uses: vitest, ./src, ./backups.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/traceProgress.test.ts`
  - *Purpose:* The contract M5 rests on: the worker changes WHO runs the trace, never WHAT it produces. These tests exercise the onLayer hook directly (in node, no Worker) because that hook is the only behavioural change to the pipeline.. Defines: TracedPath type, bands. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/transform.test.ts`
  - *Purpose:* Defines: Box type. Uses: vitest, ./src.
  - *Last Modified:* 2026-08-14

- 🗂️ `tests/webFiles.test.ts`
  - *Purpose:* Unit tests for src/web/webFiles.ts pure helpers: office file types and open list, bridge save kinds → extension, safe file names (extension add/swap, forbidden characters, fallbacks), web path round trip read by the app's basename, recent list newest-first/cap/dedupe by name.
  - *Last Modified:* 2026-09-25

- 🗂️ `tests/wordComments.test.ts`
  - *Purpose:* Comments: notes pinned to a range of text, with replies, that survive the trip into Word — a memo that circulates for review is the whole point.. Defines: CommentThread type, TipTapNode type. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/wordExtras.test.ts`
  - *Purpose:* The second wave of Word parity: the PDF layout rebuild, the manual page break, superscript/subscript, paragraph spacing, heading 4 and the quote style — each checked through the real docx writer/reader where it lands in a file, and through pure geometry where it does not.. Defines: TipTapNode type, PdfRun type, run, docXml. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/wordFeatures.test.ts`
  - *Purpose:* The word-mode repairs and additions from the 2026-08-18 QA pass: image sizing, paragraph line spacing, custom highlight/cell shading, the page setup + header/footer round trip, the font-picker filter and the find/replace matcher. Everything here is checked through the real docx writer and reader, so a regression shows up as a broken FILE, not just a broken call.. Defines: TipTapNode type, pngBytes, pngDataUrl, docXml. Uses: vitest, jszip, ./src, tiptap/pm.
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/wordFootnotes.test.ts`
  - *Purpose:* Footnotes: the reference in the text and the note itself must both survive the trip into Word — a numbered note that loses its number is worse than none.. Defines: TipTapNode type. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/wordHeaderRow.test.ts`
  - *Purpose:* A table that runs over a page break must carry its column titles onto the next page — in Chromium's print output and in the exported Word file alike. Two different mechanisms, one behaviour, so both are checked here.. Defines: TipTapNode type. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/wordOffice.test.ts`
  - *Purpose:* The daily-office bundle: templates, the number handling behind "sum the column", text↔table conversion, and the watermark's trip through docx.. Defines: TipTapNode type. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-08-18

- 🗂️ `tests/wordTrackChanges.test.ts`
  - *Purpose:* Track changes: an edit made in suggestion mode is a Word revision, so the person who receives the file gets real Accept/Reject buttons there.. Defines: TipTapNode type. Uses: vitest, jszip, ./src.
  - *Last Modified:* 2026-09-07

- 🗂️ `tests/xlsx-roundtrip.test.ts`
  - *Purpose:* يختبر هذا الملف وظائف الاستيراد والتصدير لملفات XLSX لضمان التوافق التام مع Excel.
  - *Last Modified:* 2026-07-17

- 🗂️ `tests/zorder.test.ts`
  - *Purpose:* Z-order: array position IS paint order, so reordering is a list operation.  The rule that is easy to get wrong and hard to notice: a selection keeps its own INTERNAL order when it moves. Raising a group must not scramble the stacking of its members relative to each other — that silently rearranges artwork the user did not touch.. Defines: reorder. Uses: vitest.
  - *Last Modified:* 2026-08-14
