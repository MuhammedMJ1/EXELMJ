# EXELMJ Studio — Port Plan

**Source:** `E:\exten Picker` (AI Element Picker v3.2.0, MV3) · **Destination:** `D:\EXELMJ` (Electron 43 / Vite 8 / vanilla TS)

Verified against the destination before writing: `electron/{main,ipc,preload,menu,illustrator}.ts`, `src/design/{overlayModel,shapes,images,designApp}.ts`, `scripts/build-electron.mjs`, `vite.config.ts`, `src/index.html`, `tests/`.

Facts that constrain everything below:

- The renderer is **one `BrowserWindow`, one `index.html`, three divs** (`#app` / `#word-app` / `#design-app`), mode-switched by `src/word/modeToggle.ts`, with mode apps lazily `import()`ed. Studio is a **fourth mode**, not a new window.
- `webPreferences` today: `contextIsolation: true`, `nodeIntegration: false`, one preload. **No `webviewTag`, no CSP, no `webSecurity` override, no `WebContentsView`, no `debugger` usage anywhere.** Clean slate — and `webviewTag` being off is a decision I want to keep.
- Build: **esbuild** bundles `electron/main.ts` + `electron/preload.ts` → `dist-electron/*.cjs`; **Vite** builds the renderer. Adding a guest preload and an injectable agent = two more esbuild entry points.
- `electron/main.ts` already imports `../src/i18n/en.json`. **That is the precedent that lets a shared model live under `src/studio/model/` and be imported by both processes.** Host code goes under `electron/studio/`.
- The design module's hard invariant: **PDF points, top-left origin, geometry is pure (no DOM/canvas) so it unit-tests in node.** Studio must not break either half of that.

Effort scale, one person: **S** = under a day · **M** = 1–3 days · **L** = 1–2 weeks.

---

## 1. THE KEEP LIST, ranked

Ranked by build order that keeps every step independently verifiable — which is also roughly value order. The prior art's author argued (IDEAS.md:22–26) to build ancestor-context *before* the state matrix because everything else sits on it. I agree, and I add one level: **build the IR before either**, because in our case the extraction target is not a clipboard payload, it is the builder's document model. An IR retrofitted onto an extractor is the same skewed-foundation mistake one storey up.

### Wave 1 — foundation (nothing is verifiable without these)

**1. The shared component IR + project serialization** — *NOT a port; this is IDEAS #3's design, which never shipped.*
- **Becomes:** `src/studio/model/component.ts`, `model/selector.ts`, `model/serialize.ts`, `model/devices.ts`
- **Electron primitive:** none (pure TS, vitest-testable exactly like `src/design/shapes.ts`); persisted by `node:fs` in main
- **Effort: L.** Full type definition in §3.
- *Why first:* it is the single thing all five deliverables read and write. Every mechanism below is defined as "fills field X of the IR".

**2. Guest view + injection lifecycle + the orphan guard (fixed)**
- **Becomes:** `electron/studio/guestView.ts`, `electron/studio/inject.ts`, `electron/studio/guestPreload.ts` (3rd esbuild entry)
- **Electron primitive:** `WebContentsView` + `webPreferences.preload` + `webContents.on('did-start-navigation'|'destroyed')`
- **Effort: M.**
- *Port verbatim:* the **two-factor guard** — version match **AND** liveness — not `if (window.__ALREADY__) return`. Swap the oracle: `chrome.runtime.id` becomes a `generation` integer stamped at injection and compared against a preload-exposed getter, bumped on every host restart.
- *Fix the extension's bug:* the marker must expose `dispose()` and the incoming instance **must call it before taking over**. The extension never did, so a displaced orphan kept swallowing capture-phase events forever and two overlays fought. Add `import.meta.hot?.dispose(() => picker.destroy())` for the Vite HMR case, which is the same zombie with no `chrome.*` involved.
- *Delete:* the whole `ensureContentScript` PING/inject dance. A preload is always already there.

**3. Redaction choke point** — *IDEAS #16, scored 7.3, never shipped. This is a launch blocker, not a follow-up.*
- **Becomes:** `src/studio/model/redact.ts` (rules, pure) + `electron/studio/egress.ts` (the gate)
- **Electron primitive:** `ipcMain.handle` in main, with the renderer given **no** network path to any model provider — so bypassing the gate is architecturally impossible, not merely discouraged
- **Effort: M.**
- *Port as the RULE SET, not the solution:* `scrubPII`'s regex chain, especially rule 6 (a run of ≥7 digits is an ID/card/account, never a word) and **rule 7, the Arabic-Indic digit trap** — `\b` is ASCII-only and never fires next to `٠-٩`, so the ASCII digit-run pattern silently skips every Arabic number. That is not an edge case here, it is our default case.
- *Build what didn't ship:* two destination policies — `screen` (replace with realistic **same-length** filler so artboard measurements and layout comparisons stay valid) and `data` (stable per-session pseudonyms preserving **type, not length**). Entropy blocker + known key prefixes (`eyJ`, `AKIA|ASIA`, `AIza`, `gh[pousr]_`, `sk-`, `sk_live_`, `xox[baprs]-`). **Fail closed** on unclassifiable high-entropy strings.
- *Carry the design comment verbatim:* mask by **what the data is**, never by how severe it was judged.

### Wave 2 — the picker (deliverable c), mostly port-as-is

**4. Shadow-DOM overlay host + four-layer box model + HUD**
- **Becomes:** `src/studio/agent/overlay.ts` (4th esbuild entry → `dist-electron/studio-agent.js`, IIFE, platform browser)
- **Electron primitive:** none — pure DOM, runs in the guest preload's **isolated world**
- **Effort: S.**
- *Port verbatim, these are the load-bearing details:* 0×0 `position:fixed` host carrying only the stacking context and `pointer-events:none`; **z-index 2147483640, not INT32_MAX** (7 units of headroom so HUD/hint/ruler/toast can stack above the highlight); all four layers `position:fixed` inside the shadow root so `getBoundingClientRect()` viewport coordinates are used **verbatim with zero scroll arithmetic**; `outline: 2px solid; outline-offset: -1px` for the border stroke, **never `border`**; `transition: top/left/width/height .05s linear` — one CSS line, and the entire difference between "feels like DevTools" and "debug rectangle"; `Math.max(0, …)` clamp on layer widths.
- *Adapt for us:* replace hard-coded hex with EXELMJ design tokens + light/dark mirror (the guest's colour scheme is unknown); `direction: rtl` on `:host` so the hint bar's `<kbd>` chips flow naturally instead of the hand-ordered LTR sequence; HUD right-aligns to `rect.right - hudWidth` in RTL.

**5. Selector generation → `ScopedSelector`**
- **Becomes:** `src/studio/model/selector.ts` (pure, node-testable)
- **Electron primitive:** none; `CSS.escape` is a web standard
- **Effort: M.**
- *Port:* the priority cascade with `querySelectorAll(...).length === 1` verification **at every tier**; `semanticClasses`' five utility-CSS rejection regexes verbatim (especially the shape rule `/^-?[a-z]{1,3}-[\dpxremvwh.\/-]+$/`, which catches `p-4`/`mt-2`/`w-1/2`/`gap-x-4` with no Tailwind dictionary); `structuralSelector`'s **early termination on the first uniquely-identified ancestor**, which is what caps the fragile part of the path.
- *Four fixes, all reported by the readers:*
  1. **Invert tiers 1 and 2** — `data-testid` above `#id`. Framework IDs (`input-1234`, `useId`) are volatile; a test attribute is a promise.
  2. **Cap `structuralSelector` at ~6 levels** and verify the *final joined selector*, not just the intermediate tiers. It has no cap today and never checks the result.
  3. **Scope-aware uniqueness.** `isUnique` queries `document`, so a node inside a shadow root always reports 0 matches, falls through to the structural path, and produces a selector that resolves from neither. Thread `scopeOf(el)` through, and return `{ hostPath, framePath, selector, strategy, unique }` — never a bare string.
  4. **`strategy` is the stability score** the builder needs to warn on, and `unique:false` is allowed and reported rather than lied about.
- *Register EXELMJ's own marker attribute in `TEST_ATTRS`* — then the picker's selector for our OWN generated UI is always tier-1 stable. That closes the loop between (a) and (c).

**6. Hover tracking + event blanket + scroll re-anchoring**
- **Becomes:** `src/studio/agent/hover.ts`, `agent/blanket.ts`
- **Electron primitive:** none for listeners; `webContents.insertCSS(css, {cssOrigin:'user'})` for the crosshair
- **Effort: S.**
- *Port verbatim:* capture-phase `mousemove`; **`composedPath()[0]`, not `e.target`** (retargeting rewrites `e.target` to the shadow host, so a picker using it can never select inside a web component); `swallow()` = `preventDefault` + `stopPropagation` + **`stopImmediatePropagation`** (the third is the one people forget — three handlers on the same node still fire after `stopPropagation` alone); `window.addEventListener('scroll', fn, true)` — **the `true` is load-bearing, scroll events do not bubble**, and without capture the highlight drifts the moment the user scrolls a sidebar or a virtualised list; one shared module-level `const opts = {capture:true}` for add/remove.
- *Fix the real hole:* **the swallow list has no pointer events.** `pointerdown/up/move/cancel` and `touchstart/end` all pass through, so picking inside dnd-kit / interact.js / Framer Motion / any canvas app starts a drag. Add them, plus `dragstart` and `focusin`. Leave `wheel` alone deliberately (you want to scroll while picking). Touch matters doubly for (d)'s tablet/mobile modes.
- *Upgrade the cursor:* `insertCSS` with `cssOrigin:'user'` instead of an injected `<style>`. An author-origin `*` selector **does not match inside shadow roots**, so the extension's crosshair silently failed over every web component; user-origin does apply, beats author `!important`, survives navigation, and `removeInsertedCSS(key)` is exact cleanup.
- *Add what's missing:* rAF coalescing + short-circuit on unchanged target (two forced reflows per mousemove today); `ResizeObserver` on the target for layout changes with no scroll/resize event (CSS animation, font load, lazy image, re-render); `if (!target.isConnected) { clear(); return }` — a detached target returns all-zero rects and paints a 0×0 box at the origin.

**7. Activation lifecycle + key routing**
- **Becomes:** `src/studio/agent/lifecycle.ts` + `electron/studio/hotkey.ts`
- **Electron primitive:** `Menu` accelerator + `webContents.on('before-input-event')` on the host — **not `globalShortcut`**
- **Effort: S.**
- *Rationale:* `globalShortcut` steals Alt+Shift+P from every application system-wide even when EXELMJ is minimised, and will collide with Illustrator/Photoshop — which are likely open, given the COM bridge. `before-input-event` sees keys regardless of which surface has focus, which **removes the `window.focus()` hack and the whole NAV_KEY relay** the extension needed because its side panel and page were in different processes.
- *Adapt:* `autoDeactivate` becomes a **per-invocation argument**, not a global setting — MCP wants one-shot picks, a human wants sticky mode.
- *Add:* the real `destroy()`. The extension's `destroyUI()` is defined at content.js:215 and never called from anywhere.

### Wave 3 — extraction (feeds a, b, and e)

**8. Per-tree-scope rule index + `eachStyleRule`**
- **Becomes:** `src/studio/agent/ruleIndex.ts`
- **Electron primitive:** none in-page; `webContents.debugger` → `CSS.getStyleSheetText` for the cross-origin half; `net.fetch` in main as the second source
- **Effort: M.**
- *This is the spine of every CSS mechanism.* Port verbatim: `WeakMap` keyed by **tree scope**, not document (indexing only `document` returns **zero CSS** for showcase sites that give every item its own shadow root); selector-token pre-filter (`sharesToken`) — without it a Tailwind sheet means millions of `matches()` calls; nesting resolution with `&` → `:is(parentSel)`; the **`CSSNestedDeclarations` synthesis** (Chrome 130+ rules carry declarations with no `selectorText`, and a walker keying on `selectorText` drops them silently); `adoptedStyleSheets` walked **last** because constructed sheets cascade last — source order *is* the cascade model here, there is no specificity computation anywhere.
- *Fix, loudly:* the token pre-filter drops attribute-only selectors (`[data-foo]` produces no token). Treat a token-less selector as always-candidate.
- *Fix, loudly:* **`@supports` and `@container` are folded into the same string as `@media` and re-emitted as `@media (...)`** — a supports-gated rule becomes a media query that never matches (dead in the copy), a container query becomes a viewport query (fires at the wrong times), and **`@layer` is dropped entirely**, flattening layered rules so they now beat rules they used to lose to. Carry a **typed condition stack** instead (see §3, `AuthoredRule.conditions`).
- *The Electron win:* cross-origin stylesheets throw `SecurityError` on `.cssRules` and are silently skipped — **the extension's single largest silent failure**; a page whose CSS is on a no-CORS CDN currently extracts to nothing. Main-process `net.fetch` has no CORS, and `CSS.getStyleSheetText` sits below the security boundary.

**9. `ancestorContext` — environment reconstruction (IDEAS #2)**
- **Becomes:** `src/studio/agent/ancestorContext.ts` → fills `StyleBundle.inherited/parentLayout/backdrop` and `TokenScopeTree`
- **Electron primitive:** none (pure DOM); optionally `CSS.getMatchedStylesForNode` for the inherited chain
- **Effort: M.**
- *Port the algorithm exactly, it is non-obvious:* `getComputedStyle` returns the **resolved** value and never the `var(--brand)` reference, so references are harvested from **authored rules** (token-set pre-filter → selector match against the subtree → `/var\(\s*(--[\w-]+)/g`) and only then resolved against the element's own cascade, following ≤3 levels of token-defined-by-token indirection.
- *Port the second pass, which nothing else would find:* `eachStyleRule` never yields `@keyframes`, so a dot whose colour is only set at `66% { background: var(--wire) }` exported unresolved and animated to transparent. Collect `animationName` across the subtree, pull each keyframes body, regex its `var()` refs. **Measured: 12 of 94 keyframes in one motion library.**
- *Port the `backdrop` walk* (first non-transparent ancestor background, crossing shadow boundaries via `getRootNode().host` where `parentElement` stops) — a dark component previewed on white is invisible.
- *Add what didn't ship:* `container-type`/`container-name` lifted from ancestors onto the synthesised wrapper. IDEAS #2 names container context as one of the five losses and the code implements four.
- *Widen for us:* the ancestor-class filter is `/dark|light|theme|rtl|ltr|mode/i` — for an Arabic-first app the **`dir` attribute** matters more than any class and is only captured indirectly today.

**10. State Ghost (IDEAS #1) — the state matrix**
- **Becomes:** `src/studio/agent/states.ts` → fills `StateMatrix`
- **Electron primitive:** in-page CSSOM as the portable path; `CSS.forcePseudoState` + `CSS.getComputedStyleForNode` as the **measured** path
- **Effort: M.**
- *Port verbatim:* `ANY_STATE_RE` / `baseSelector` / `matchableSelector` / `triggerSelector` / `subjectCompound`; the output **triple** (what you touch / what kind of touch / what changes) — the #1 reconstruction failure is hovering the card when the thing that changes is the heading inside it; diffing declared values against the **resting** computed style so "changes" means changed; shipping the author's **verbatim declarations** alongside the whitelist summary (a multi-step interaction came out as a colour change when only the summary shipped).
- *Two rules that must survive review pressure:*
  - `ANY_STATE_RE` and `baseSelector` **must stay in lockstep**. A marker recognised but not strippable files the rule as a state and then fails the very match test that filing it there was meant to let it pass — strictly worse than leaving it a resting rule.
  - **Bare `.open`/`.active`/`.show`/`.selected` stay excluded.** Half the web uses them for the current tab; treating them as states leaves ordinary elements previewing unstyled. Only compounded markers (`.nav-dropdown.open`) count. Measured widening was 1.95% / 1.68% of rules with zero false positives.
- *The Electron upgrade:* `CSS.forcePseudoState({forcedPseudoClasses:['hover','active','focus','focus-visible']})` lets us **actually render the state and measure it** — the State Ghost done by the engine. Keep the static harvest as the acquisition path for CSS we EMIT, and use forced states as the verification oracle. Tag each entry `source: 'authored' | 'forced'`.

**11. `ruleCssText` — the shorthand-with-`var()` serialization hole**
- **Becomes:** part of `agent/ruleIndex.ts`
- **Effort: S.**
- `border: 4px solid var(--line)` reads back from the CSSOM as **fifteen empty longhands**, and `cssText` emits `border-top-width: ;` — not merely lossy but **invalid CSS that kills the whole rule when pasted**. Asking for the shorthand does not help: `border`, `border-width`, `border-style`, `border-color` all return `""`. Port the fallback (fill from `getComputedStyle` of an element the rule actually paints; drop rather than emit an empty declaration) **and the counter-rule: pass `sampleEl = null` for STATE rules**, because reading a hover rule off an element that is not hovered silently fills the blanks with resting values and inverts the state.
- *Primary path in Electron:* `CSS.getMatchedStylesForNode` + `CSS.getStyleSheetText` + source ranges → **byte-identical author CSS**, no re-serialization, comments and `var()` preserved.

**12. `componentCss` assembly order → IR blocks, not a string**
- **Becomes:** `src/studio/emit/css.ts`
- **Effort: M.**
- The **order is load-bearing** and every step of it was paid for: `:root` tokens → `.parent` wrapper (without it the size collapses) → inherited block → **`@property` registrations first** (an unregistered custom property interpolates **discretely** — the copy is pixel-perfect at rest and visibly wrong in motion with no error anywhere) → timeline rules with their ancestor selectors → base rules → transitions (only if no base rule already carried one) → state rules, **re-wrapped in `@starting-style` when flagged** → keyframes, deduped → animation bindings **skipped entirely if the author already declared `animation`**.
- *That last guard three times over:* the `animation` shorthand **resets every sub-property it omits**. It turned an authored `infinite` pulse into a single frozen pass; it reset `forwards` to `none` so an element written `opacity:0` and revealed by its animation stayed invisible forever. **Emit longhands in generated code** so a later rule cannot silently clobber an earlier one.
- *Add what the extension never emitted:* `@font-face`. It harvests them and uses them only to label files in an assets tab, so every captured component that uses a webfont exports with `font-family:'Inter'` and no font behind it. One join away.
- *Namespace keyframe names per component* (`--exelmj-<id>-spin`) — dedup by full text means two different `@keyframes spin` both survive and the second silently wins.

**13. Markup: the readable/verbatim split + `inert()`**
- **Becomes:** `src/studio/model/markup.ts`, `src/studio/emit/inert.ts`
- **Effort: S.**
- *Port the two-mode design unchanged, including the rationale comment.* Readable trims class lists past 8 and drops inline styles; **verbatim keeps both**, because dropping the ninth utility class or the inline styles silently breaks the component. `on*` attributes stripped unconditionally in **both** modes.
- *Fix:* the readable mode writes a literal `…` **into the class attribute**, producing markup that looks pasteable and is functionally dead. Use a comment node.
- *`inert()` is required and the stakes go up:* the extension's escape failure was a broken paste; ours writes to disk and is then loaded by our own guest **with a preload attached**. Keep `</script|</style` → `<\/…` and `<!--` → `<\!--`, and extend with `</textarea`, `</title`, `</xmp`, `]]>`, U+2028/2029. **Better: never concatenate** — emit separate files and keep the single-string bundle as a clipboard convenience only.
- *Keep `SAFE_EVENT_RE = /^[A-Za-z][\w.:-]{0,39}$/` and the drop-don't-escape rule.* There is no legitimate `</style>` in an event type.

**14. Scan pipeline: triage, two-tier dedup, ranking, drop ledger**
- **Becomes:** `src/studio/agent/scan.ts`
- **Electron primitive:** hidden `WebContentsView` with `backgroundThrottling:false`; `Emulation.setDeviceMetricsOverride` with a tall height replacing the scroll sweep
- **Effort: M.**
- *Port verbatim:* the **two-tier dedup escalation** — motion signature first (inert on static pages), escalating to structure signature **only** once a group has shown ≥3 distinct motions. Measured: MDN grows 0%, a motion gallery goes 7 → 144 cards. Adding structure unconditionally inflates MDN 62–74%; adding child count inflates it 61%. Do not "improve" it.
- *Port:* class matching on **words, never substrings** (substring matching read the `item` inside Tailwind's `items-center` and filed every flex wrapper as a card); the analytics-class filter (`plausible-event-effect=Card+Resize` is unique per instance and defeats dedup entirely); the **non-transitive-comparator fix** — precompute `__depth` = number of other accepted components above this one, then sort `(depth asc, rank desc)`; **never** a pairwise `contains()` comparator, `Array.sort` mangles it.
- *Port the budget caps as constants, they are the difference between a scan and a hang:* `deepAll` 9000 nodes / depth 14; 120 base + 120 state rules; 80 descendants for matching, 60 for var lifting, 200 for state scanning; pass-2 deadline 8000 ms with `truncated` reported rather than hanging; sweep budget 12000 ms.
- *Port the `dropped` ledger and always render it.* A silent "(7)" beside a page holding 144 cards is exactly how the collapse bug survived. In our model this feeds `provenance.degraded[]`.
- *Adapt:* `paintScore`'s viewport-area penalty is computed from `innerWidth*innerHeight`, which **changes when a panel opens** — the author's own words: "inherently unstable". We control the view; **hold the guest bounds constant for the duration of a scan.**
- *Replace the scroll sweep* with a tall `setDeviceMetricsOverride` so everything intersects at once — no scrolling, no ~1s-per-screen mount cost, no 12s budget. Keep the budget+`truncated` protocol as the fallback.

### Wave 4 — the mini-browser and the loop (deliverables d, a, e)

**15. Device emulation + the desktop/tablet/mobile switch**
- **Becomes:** `electron/studio/device.ts` + `src/studio/model/devices.ts`
- **Electron primitive:** CDP `Emulation.setDeviceMetricsOverride` / `setTouchEmulationEnabled` / `setUserAgentOverride` / `setEmulatedMedia`
- **Effort: M.** Full detail in §4.

**16. Sandboxed preview + component library gallery**
- **Becomes:** `src/studio/ui/preview.ts`, `src/studio/ui/library.ts`
- **Electron primitive:** `<iframe sandbox srcdoc>` for thumbnails (unchanged, and correct); `node:fs` for the store
- **Effort: M.**
- *Port the `previewDoc` template including all three CSS fixes:* `place-content` **in addition to** `place-items` (place-items alone leaves the auto-sized grid row wherever block flow put it); `width:max-content;height:max-content` on the scaled wrapper (a component wider than the thumbnail lays out against the left edge and clips on one side when scaled about its centre); `.parent` wrapper because extracted rules are written relative to a parent selector; backdrop from `context.backdrop`.
- *Port the two scale policies:* cards `min(1, bw*0.84/cw, bh*0.84/ch)` — **84%, never enlarged**, because `::before`/`::after` glows and badges live outside the element's own box, and a 20px switch blown up looks broken; the detail sheet `min(2.2, …)` because the point of opening it is to work with the thing.
- *Port the `IntersectionObserver` lazy mount* (`rootMargin:'150px'`) — 40 live frames at once stalls the panel — and **clear `innerHTML` on close** or the frame keeps animating off-screen forever.
- *Do NOT port the window-blur/`activeElement` click detection.* That heuristic exists only because `sandbox=""` makes a frame cross-origin and it **consumes the click entirely**. We own the srcdoc: use `sandbox="allow-scripts"` (still opaque-origin, no `allow-same-origin`) and `parent.postMessage({studio:'preview-click', idx})`. Deterministic, survives alt-tab.
- *Store:* **one file per component**, `components/<sha256>.json`. No 10 MB ceiling, no read-modify-write of a whole array, O(1) delete, git-diffable. Keep `libId`'s lesson (144 same-sized cards from one page collided on six fields) but replace the string fingerprint with `sha256(verbatim + css + text)`.

**17. Verification pass (IDEAS #7) — the moat**
- **Becomes:** `electron/studio/verify.ts` + `src/studio/model/fingerprint.ts`
- **Electron primitive:** hidden `WebContentsView` (real dimensions!) + `capturePage` + `CSS.forcePseudoState` + `DOM.getBoxModel`
- **Effort: L.**
- *This is the highest-leverage item in the whole port, and the author already proved it works — outside the product.* His `scratchpad/audit.js` CDP harness found and fixed four real bugs and moved PASS from 111 → 120 of 144, MOTION-DIFF 1 → 0, PAINT-DIFF 11 → 1. In Electron the same protocol is `webContents.debugger`, so **the harness stops being scaffolding and becomes product code**. Ask for that scratchpad directory before designing this.
- *Port the three fingerprints* (motion / paint / size) and the verdict vocabulary `PASS | SIZE-DIFF | PAINT-DIFF | MOTION-DIFF`.
- *Port its hard-won rules, all of which will bite again:*
  - **The tool must verify itself before it verifies anything.** First run reported 144 defects, every one phantom, because the site's CSS had not loaded. Fix: wait for the stylesheet rule count to **stabilise across 4 identical reads**, health-check before starting, use a real user agent.
  - **Freeze animations on BOTH sides, TWICE** (`getAnimations().forEach(a => { a.currentTime = 0; a.pause() })` after 60 ms then again after 40 ms). One freeze left 5 phantom differences.
  - **Audit blindness:** an early harness selected `.card` elements directly instead of running the real pipeline and reported 120/144 passing while the user was looking at empty previews. Any verification must run the **actual** pipeline — all passes plus the ordering.
- *Port IDEAS #8's partition and enforce it in the type system:* `PaintProp` may be auto-pinned; `LayoutProp` may **only** produce a `Diagnosis` object. Pixel-pinning widths makes the result look identical while having killed the design's responsiveness — the doc records that exact regression already happening once, converging by destroying the product and reporting success.

**18. Design token census + the three missing clustering steps (IDEAS #9)**
- **Becomes:** `src/studio/model/tokens.ts`
- **Electron primitive:** none
- **Effort: M.** Best value-to-effort ratio in the source, and it serves (b) directly.
- *Port the census as-is* (colours with usage sets, fonts, sizes, gradients, shadows, radii with the `≥500 → 9999` full sentinel, spacings 0<n≤160), capped at 5000 elements.
- *Add the three steps that carry all the quality and never shipped:* snap spacing to the nearest 4px and merge; merge colours by **OKLCH distance**, not hex equality (this alone collapses the usual 30-colour list to ~8 real tokens — `#4f46e5` and `#4f46e6` are two tokens today); fit a **geometric ratio** over the type sizes (1.125 / 1.2 / 1.25 / 1.333) instead of dumping the top 8 raw pixel values.
- *Add the free-names step:* enumerate the page's own declared custom properties and match them to census values **before** naming anything yourself. Sites with a real design system hand you the token names.
- *Label `buildRamp` honestly.* Synthesising a 50–950 ramp from one hex by lightness substitution is **invention presented as extraction**; mark it generated in the UI.

**19. Listener inventory via CDP + `clickUnsafe`**
- **Becomes:** `electron/studio/listeners.ts` + `src/studio/model/safety.ts`
- **Electron primitive:** `DOMDebugger.getEventListeners({objectId, depth:-1, pierce:true})` + `Debugger.getScriptSource` (+ source maps)
- **Effort: M.**
- *Replace hook.js's 281-line monkey-patch with ~60 lines of CDP.* CDP reads Blink's actual listener table from outside the renderer: the page cannot detect, un-patch or poison it; it returns **`once:true` listeners** (which hook.js deliberately never records, so a component whose behaviour is one one-shot listener reports zero handlers → `clickUnsafe` refuses → it is silently never recorded); it returns **IDL property handlers** (`el.onclick = fn`, invisible to `addEventListener` patching); it returns `useCapture`/`passive`; and it returns `scriptId` + line/column, which with `Debugger.getScriptSource` and `sourceMapURL` yields the **original unminified TypeScript**. `String(fn)` can never do that.
- *Port `clickUnsafe` verbatim, including:* the **fail-closed catch** (`catch { return true }` — the default answer to "is this safe?" is no); the whole-subtree scan of 60 nodes (the event lands on whatever `elementFromPoint` returns, almost always a descendant); `EFFECT_RE`; and the rule **"no readable non-delegated handler = unsafe"**.
- *Port `DESTRUCTIVE_RE` and extend rather than rewrite* — it is already bilingual and includes احذف، حذف، إزالة، شراء، ادفع، إرسال، تأكيد، اشتراك، خروج. Directly reusable in an Arabic-first product.
- *Port the insight that makes source-scanning work:* a bundler renames locals but **can never rename** `fetch`, `XMLHttpRequest`, `sendBeacon`, `localStorage`, `document.cookie`, `classList`, `aria-expanded`. `EFFECT_RE` matches only globals and property names, which is why it survives on production sites while identifier-based analysis collapses.
- *Port the design rule, verbatim, as a comment:* **a JS signal decides ORDER, never admission.** Filtering the record queue by it silently excluded every component inside a shadow root and every framework delegating from its own root — the whole pass became a no-op on entire families of sites.

**20. Accessibility via CDP (IDEAS #4's backbone)**
- **Becomes:** `electron/studio/a11y.ts` → fills `Semantics`
- **Electron primitive:** `Accessibility.enable` + `getPartialAXTree` / `getFullAXTree`
- **Effort: S.** — *and it is the single largest capability win in the port.*
- The extension's `getAccessibility` is **roughly 30% of the ARIA accname algorithm, in the wrong order**: no `aria-labelledby` dereferencing (the spec's first check), no `<label for>`, no legend/caption/figcaption, no `input[value]`, no placeholder, no implicit role (a bare `<button>` reports no role at all), and it reads `textContent`, which includes `display:none` and `aria-hidden` subtrees the spec excludes. It was written that way **only to avoid the `chrome.debugger` permission prompt.** We own the WebContents; `webContents.debugger` costs nothing. Replace it wholesale with Chromium's own computed name and role, with the `sources` array showing which rule produced it. Keep the JS approximation as the no-debugger fallback.

**21. Static motion extraction (IDEAS #18 path a)**
- **Becomes:** `src/studio/agent/motion.ts` → fills `MotionBundle.authored`
- **Effort: M.**
- *Port verbatim:* `splitTopLevel` (so `cubic-bezier(0.4,0,0.2,1)` counts as one value, not four); `ANIM_KEYWORD_RE` name extraction; `stateKeyframesFor` — a wave a button plays on hover never runs at rest, so **nothing else would collect it**; `keyframesText`'s scope-first, document-fallback search.
- *Defer the recorder (Pass 3) to §6/§7.* It is the part that dispatches real clicks.

**22. Budgeted serializer (IDEAS #4) — mandatory for MCP**
- **Becomes:** `src/studio/model/budget.ts`
- **Electron primitive:** a real tokenizer in main (`@anthropic-ai/tokenizer` or `gpt-tokenizer`) instead of a character heuristic
- **Effort: M.**
- *Never shipped for UI.* The real AI hand-off today is `(d.outerHTML||'').slice(0,1500)` with `maxTokens:1000` — a blind character cut that can land mid-tag, discarding the xpath, attributes, accessibility, tailwind, metrics and computed styles that `collect()` just built. The only budgeted exporter that shipped is `getCodeForReview(budget=60000)`, over source code.
- *Port that one's shape as the contract:* priority queue → fill → per-chunk `truncated` flag → **return the accounting** `{chunks, bytes, budget}`. Change the unit from bytes to tokens and the priority list from scripts to IR fields.
- *Build the compression ladder, in this order:* fold repeated siblings to `×12` using the `instances` count the scanner **already computes and never uses**; replace `<img src="data:...">` with `<img alt="…" 240×160 dominant:#3b4c6b>`; replace resolved literals with the `var(--token)` names `ancestorContext` already recovered.
- *Two rules:* **never truncate mid-tag** — cut at element boundaries in the tree, not in the string; and **always return `dropped[]`** — silent truncation is the failure mode the idea exists to fix. Keep the framing comment: every other tool compresses for file size, we compress for token count, **and those goals are opposed** (base64-inlining an image is great for one and catastrophic for the other).

**23. Content-addressed asset store (IDEAS #23)**
- **Becomes:** `electron/studio/assets.ts`
- **Electron primitive:** `node:crypto.createHash('sha256')` + `assets/<sha256>.<ext>` on disk
- **Effort: S.** The doc calls this "the cheapest and most certain item on the list… a guaranteed win you can build in a day." It is the foundation for the library index, capture diffing (#12), shared-CSS lifting, the icon cache and the font cache.
- *Keep the ideas the shipped code proves:* whitespace-normalised SVG markup as a content key (already accidentally content-addressed); `currentSrc` not `src` for images (the srcset variant the browser actually chose) **and remove `srcset` after rewriting** or the browser re-picks.

**24. Icon glyph rendering + sprite resolution (feeds b)**
- **Becomes:** `src/studio/agent/icons.ts`
- **Effort: S.**
- *Port the two guards, they are what make this "reproduce or admit failure" rather than "guess":* the **ligature width check** (an icon-font ligature collapses to ~1em; if `measureText` width exceeds `64*1.7` the font did not substitute and you are about to draw the literal WORD) and the **ink verification** (sample the alpha channel every 40 bytes, require ≥10 inked samples — a missing glyph draws nothing). Same principle: canvas emptiness is decided by **inspecting pixels**, never by data-URL length — a solid-colour canvas compresses to a tiny string.
- *Port `resolveSprites`* (inline `<use href="#id">` into a `<g>`, copy the `viewBox`, reject any SVG whose markup contains `<symbol>` or the size fallback turns a sprite sheet into one enormous unusable "icon"). A resolved self-contained SVG string is **exactly what EXELMJ's existing tracer/vector editor already ingests.**
- *Add the codepoint→name table IDEAS #15 recommends and the author never built.* `unquoteContent` already decodes `\e903` to the actual codepoint — the lookup is a pure addition and it is the highest-accuracy, lowest-effort piece of that idea.
- *Go further than the source could:* our vector designer can render the glyph to a **path** via the downloaded woff2 (opentype.js/fontkit on real OS/2 tables) and get an editable vector instead of a 256px PNG.

**25. The MCP server**
- **Becomes:** `electron/studio/mcp/` + `scripts/mcp-shim.mjs`
- **Effort: M.** Detail in §5.

---

## 2. THE DROP LIST

### (a) Pure MV3 scaffolding — delete, do not translate

| Extension mechanism | Why it exists | What replaces it |
|---|---|---|
| `return true` from `onMessage` to keep the port open | MV3's synchronous `sendResponse` channel | `ipcMain.handle` returns a promise natively. **This is the single most common silent-failure bug in extension code** ("message port closed before a response was received") and it has no analogue. Delete the protocol entirely. |
| `relayToActiveTab` 3-hop (panel→worker→content→worker→panel) | Neither endpoint had privileges | Studio panel → main (`invoke`) → guest (`executeJavaScript` / port). Two hops. |
| `ensureContentScript` PING/version handshake in the hot path | `document_idle` races, orphaned scripts | Preload is always there before the first page script. Keep the version handshake **only** for dev-mode HMR. |
| `pickerState` Map re-verified with `GET_PICKER_STATE` | MV3 workers die after ~30s idle | Main process is not ephemeral. Keep only the `did-start-navigation` invalidation — a navigation still destroys the injected agent. |
| Two hand-synced version constants (`CONTENT_VERSION` 35 / `PICKER_VERSION` 35) | No module system across the boundary | One build-time define. A drift bug waiting to happen. |
| `chrome.action.setIcon` / side panel / `chrome.commands` | Extension chrome | A CSS class on our toolbar button; a DOM panel in our own renderer; a `Menu` accelerator. |
| `isInjectableUrl` **blocklist** (`chrome://`, web store origins, `view-source:`) | Had to work on the whole web | Invert to an **allowlist** — `studio://*`, `http://localhost:*`, plus explicitly user-approved origins. Keep the **single typed sentinel** (`{ok:false, code:'RESTRICTED'}` → one sentence) rather than leaking engine error text. |
| `chrome.downloads` with a forced subfolder | Extensions can only write under Downloads | `fs.writeFile` into the project's own `assets/`, with the exact filename the emitted code references. **Keep the `^https?:` scheme guard and ADD Windows path-traversal sanitising** (`..`, drive letters, `CON`/`NUL`/`COM1`) — `chrome.downloads` sanitised for you; `fs` does not. |

### (b) Monkey-patches CDP replaces — **call these out loudly**

- **hook.js's entire `addEventListener` registry (281 lines).** Replaced by `DOMDebugger.getEventListeners`, which is invisible to the page, cannot be un-patched, and sees `once`/`passive`/`capture`/IDL handlers that the patch structurally cannot. Its `toString` masking (the author states plainly that `Function.prototype.toString.call()` still sees through it) becomes pointless — for our own generated projects there is no adversary.
- **The cross-world bridge** — `data-aiep-q` attribute stamping + nonce + `CustomEvent` carrying a **JSON string** (because a structured `detail` does not survive MAIN→isolated) + a 500 ms timeout + attribute cleanup. Every line of it works around a limitation Electron does not have. `webContents.executeJavaScript` returns a structured-cloned value; CDP `DOM.resolveNode` gives a real cross-process element handle, which is exactly what `data-aiep-q` was faking. **Keep only the batching discipline: one round-trip for 300 elements, not 300 round-trips.**
- **The `NET_INTERCEPTOR` fetch/XHR patch.** Replaced by `Network.enable` + `Network.getResponseBody` / `session.webRequest`. Gains: no **arm+reload** (the patch only sees calls made after injection, so the first page load — which carries the SSR payload and the most important XHRs — is *always* missed; this is the largest functional limitation in the extension and it evaporates); coverage of `sendBeacon`, `EventSource`, WebSockets, Web Workers, service workers and cross-origin frames, all of which the patch misses; no `resp.clone().text()` doubling peak memory; and `xhr.responseType='json'` responses stop being **silently invisible** (the patch can only read `responseText` for `''`/`'text'`).
- **The `isTrusted` window guard.** **This one is dead, not upgraded** — see §6. `sendInputEvent`/`Input.dispatchMouseEvent` produce trusted events, so nothing inside the page can tell our clicks from the user's. Safety must move out of the event layer entirely.
- **`chrome.dom.openOrClosedShadowRoot`** — the only genuinely extension-exclusive API in the source, with **no plain-JS Electron equivalent**. `DOM.getDocument({pierce:true})` is strictly better: it reaches closed roots **and** cross-origin frames, and returns `shadowRootType` per node. The port loses nothing here and gains two capabilities the extension explicitly gave up on.

### (c) Replaced by a real filesystem — **loudly**

- The hand-rolled **DEFLATE-via-CompressionStream ZIP writer** and the entire single-file/ZIP clone path (25 MB / 300 MB / 2 MB-per-image budgets, base64 data URIs, `URL.createObjectURL` + synthetic `<a download>` + a 5-second revoke timer). All of it exists because a Chrome extension cannot write a folder. `fs.promises.writeFile` + `dialog.showSaveDialog`. **Keep exactly three ideas:** positional pairing of the live node list to the clone node list (so you read computed values off the live node while mutating the clone), `currentSrc` not `src`, and split/join for `url()` rewriting (no escaping problems).
- **The 10 MB `chrome.storage.local` ceiling and every compromise it forced:** dropping the raw motion sample series, capping handler source at 1200 chars, the 8 MB pre-emptive warning, the whole-array read-modify-write, and `background.js`'s serialised write chain. **Keep the mutex pattern anyway** — `chain.then(job, job)` is four lines and `await fs.readFile` yields, so read-modify-write clobbering is reproducible in Electron main despite it being single-threaded.
- The **300-record `netCaptures` ring buffer** that silently drops the oldest entries. Spill to an NDJSON log on disk; keep metadata in memory.

### (d) Replaced by better screenshots — **loudly**

- The element-shot pipeline: `scrollIntoView` → hide overlay → 120 ms sleep → `captureVisibleTab` → manual DPR crop with 9-arg `drawImage` → data URL → anchor click. Replaced by `webContents.capturePage(rect)` (takes the rect in CSS pixels, returns a `NativeImage`) or `Page.captureScreenshot({clip, captureBeyondViewport:true})`, which captures **regions outside the viewport** — removing the scroll step and enabling full-page shots the extension could never take.
- The batch "one capture, 40 crops" trick — that was a workaround for `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`, a Chrome policy, not physics.
- **Keep two things:** hide your own overlay before capturing and restore it after (it is easy to ship a picker whose every screenshot has a blue outline baked in), and **PNG never JPEG** for anything feeding colour extraction — JPEG chroma subsampling returns literally wrong hex values. That is a correctness constraint, not a preference.

### (e) Whole product areas that are not ours

Roughly **1900 of `sidepanel.js`'s 4099 lines**, plus ~150 of `background.js`: the البيانات network monitor / bulk-fetch / pagination crawler as a *product*; اللهجة the Arabic dialect corpus harvester; الأمان the secret/PII scanner + bounty report generator + Supabase RLS prober; الذكاء the BYO-API-key provider matrix; استنساخ whole-site clone. Separate product ambitions that happen to share a panel. See §7 for the argument on the AI provider layer specifically.

### (f) The extension's own bugs — inherit none of them

No `prev.dispose()` on the displaced orphan · `structuralSelector` with no depth cap and no final uniqueness check · `isUnique` querying `document` for shadow-scoped nodes · `@supports`/`@container` re-emitted as `@media` and `@layer` dropped · `componentCss` never emitting `@font-face` · keyframe names colliding across components · `collect()` never setting `data.url` while `sidepanel.js` reads it twice (so every saved component loses its provenance) · `destroyUI()` defined and never called · `firstElementChildInViewport` doing no viewport test · classes listed twice in the JSON output · the swallow list missing pointer and touch events · the preview iframe being ~150 px wide so **every mobile media query fires inside it** (flagged by the author as unaddressed).

---

## 3. THE ARCHITECTURE

### The decision, stated plainly

**Studio sits BESIDE `DesignProject` as a separate document type, sharing a primitives layer, connected by a one-way compiler (`StudioComponent → DesignProject`). It does not extend `DesignProject`.**

Four reasons, in order of weight:

1. **The coordinate systems are incompatible and both are right.** `DesignProject` is PDF points from a page's top-left on a fixed-size page — the correct model for print, and the reason `pdfOverlayExport.ts` and `wordExport.ts` are exact. A web component has no page: it is CSS pixels with intrinsic sizing, reflow, media queries, container queries, and states. Flattening a component into `Shape{x,y,w,h}` discards precisely what makes it a component. Inflating an artboard into a DOM model discards print fidelity. Neither model can absorb the other without becoming worse at its own job.
2. **`DesignProject` is a sidecar with a hard invariant** — `<file>.exelmj.json`, keyed by the artwork's `source` basename, and *"the original artwork is NEVER modified."* A Studio project is not a sidecar to anything; it is a project folder that owns its own files. Different identity, different lifecycle, different save semantics.
3. **Version pressure.** `DesignProject` is at v3 with real migration code (v1→v2→v3, written after artboard navigation silently destroyed other pages' texts) and shipped users. Bolting a 40-field component IR onto it means every sidecar carries fields it will never use and every Studio schema change forces a `DesignProject` version bump.
4. **The bridge is small, and it is where the value is.** Everything the compiler needs already exists in `src/design/`: `trace.ts` (raster→vector), `curveFit.ts`, `centerline.ts`, `gradientFit.ts`, `bidiRuns.ts`. The compiler is a ~300-line adapter, not a rewrite.

### The shared primitives layer

`src/studio/model/units.ts` — the *only* place the two documents touch:

```ts
export const PX_PER_PT = 96 / 72          // 1.3333…
export const ptFromPx = (px: number) => px * 72 / 96   // 0.75
export const pxFromPt = (pt: number) => pt * 96 / 72
export interface Rect { x: number; y: number; w: number; h: number }
```

Plus colour parsing and — deliberately — **the gradient type reused verbatim from `Shape['gradient']`** (`{x1,y1,x2,y2,from,to}`). Studio's token layer emits into exactly that shape, which is why gradients cross the bridge for free.

### `StudioComponent` — the typed structure

```ts
// src/studio/model/component.ts
// All lengths are CSS pixels unless a field name ends in `Pt`.

export interface StudioComponent {
  schema: 1
  /** sha256(verbatim markup + css + text) — content-addressed identity. */
  id: string
  name: string
  kind: ComponentKind          // 'button'|'input'|'toggle'|'card'|'nav'|'modal'|…|'interactive'
  provenance: Provenance
  anchor: ScopedSelector       // how to re-find it in the source
  box: { w: number; h: number }
  markup: Markup
  style: StyleBundle
  tokens: TokenScopeTree       // IDEAS #11's scope tree = the builder's prop panel
  states: StateMatrix          // IDEAS #1's triple
  motion: MotionBundle
  behavior: BehaviorInfo
  semantics: Semantics
  repeat?: RepeatSpec          // IDEAS #3's template + data
  assets: AssetRef[]           // sha256 refs — never bytes
  emit?: EmitHints
}

export interface Provenance {
  url: string                  // fixes the extension's permanently-undefined data.url
  host: string
  capturedAt: string           // ISO
  viewport: { w: number; h: number; dpr: number; device: string }
  method: ('dom' | 'cdp')[]    // which acquisition paths actually ran
  /** THE HONESTY FIELD — see below. Required, never optional. */
  degraded: Degradation[]
  consent?: { grantedAt: string; scope: 'own-project' | 'third-party'; origin: string }
}
export interface Degradation { what: string; reason: string; count?: number }

export interface ScopedSelector {
  hostPath: string[]           // shadow-host chain, outermost first; [] = light DOM
  framePath: number[]          // iframe indices from the top frame; [] = top
  selector: string
  strategy: 'testid'|'id'|'name'|'class'|'aria'|'structural'   // = stability score
  unique: boolean              // verified in the RIGHT scope; false is reported, not hidden
  backendNodeId?: number       // CDP handle — session-lifetime only, never persisted
}

export interface Markup {
  readable: string             // trimmed classes, no inline styles, no on*, capped
  verbatim: string | FileRef   // byte-fidelity minus on*; spills to disk when large
  textPreview: string
}

export interface StyleBundle {
  base: AuthoredRule[]
  states: AuthoredRule[]
  keyframes: Record<string, string>     // namespaced per component
  registrations: string[]               // @property — emitted FIRST
  timelines: AuthoredRule[]             // scroll/view-timeline declared on ancestors
  fontFaces: FontFaceRule[]             // the extension never emitted these
  inherited: Record<string, string>
  parentLayout?: Record<string, string>
  container?: { type: string; name?: string }   // IDEAS #2's missing fifth loss
  backdrop?: string
}

export interface AuthoredRule {
  selector: string
  css: string
  /** TYPED condition STACK, not a concatenated @media string.
   *  This is the fix for @supports/@container being re-emitted as @media
   *  and @layer being dropped entirely. */
  conditions: Condition[]
  startingStyle?: boolean
  origin: 'author' | 'reconstructed'
}
export type Condition =
  | { kind: 'media';     text: string }
  | { kind: 'supports';  text: string }
  | { kind: 'container'; text: string; name?: string }
  | { kind: 'layer';     name?: string }
  | { kind: 'scope';     root: string; limit?: string }

export interface StateMatrix { entries: StateEntry[] }
export interface StateEntry {
  trigger: string                                    // WHAT you touch
  kind: StateKind                                    // WHAT KIND of touch
  target: string                                     // WHAT changes ('' = self)
  changes: Record<string, { from: string; to: string }>
  source: 'authored' | 'forced'                      // static harvest vs CDP measurement
}

export interface MotionBundle {
  authored: { transitions: TransitionSpec[]; animations: AnimationSpec[] }
  recorded?: RecordedPhase[]
}
export interface RecordedPhase {
  key: string; trigger: string
  durationMs: number                                 // settle time, NOT the window
  bindings: { nodePath: string | null; keyframesName: string }[]
  keyframes: Record<string, Record<number, Record<string, string>>>  // name → pct → props
  samples?: FileRef                                  // raw series — we have a filesystem
}

export interface TokenScopeTree { root: TokenScope }
export interface TokenScope {
  selector: string                       // ':root' at the top
  values: Record<string, string>         // --name → resolved value
  refs: Record<string, string>           // --name → the var() chain that produced it
  children: TokenScope[]                 // divergences become nested scopes
}
```

Three design choices worth defending:

- **`provenance.degraded[]` is required, not optional.** It is the generalisation of the extension's scattered honesty signals — the `dropped {dupe, hidden, size}` ledger, the `truncated` flags, `getCodeForReview`'s per-chunk accounting, IDEAS #4's degradation ladder — into one place. Every subsystem that gives up **appends to it**: a cross-origin stylesheet that could not be read, a closed shadow root we could not pierce, a pass-2 deadline hit, a field cut by the token budget, a CDP attach that failed because DevTools was open. This is the direct structural answer to the source's own strategic finding: *silent failures are the real enemy; any feature that does not know it has failed is a liability.*
- **`TokenScopeTree` instead of a flat `:root` block.** The extension flattens every variable into one `:root {}`. IDEAS #11's insight is that the *scope* tree — which subset of elements sees which value — **is literally the component's customisation API**, i.e. the builder's props panel. Building it is: group elements by resolved value per var name; the LCA of each group is that value's scope; emit nested rules.
- **`repeat` is a first-class field.** IDEAS #3's template+data folding is the ~50× compression *and* the shape the developer wanted anyway — the token-saving step and the output-quality step are the same step. The scanner already computes the `instances` count and never uses it to compress anything.

### Serialization

```
<project>/
  studio.json                     # StudioProject: schema, name, device, canvas pages, component id list
  components/<sha256>.json        # StudioComponent minus heavy fields
  components/<sha256>.verbatim.html
  components/<sha256>.css
  components/<sha256>.samples.json
  assets/<sha256>.<ext>           # content-addressed
  emit/                           # the generated project the mini-browser serves
```

One file per component. Writes go through a single-slot promise mutex (`chain.then(job, job)`, ported) because `await fs.readFile` yields. Reads are lazy: the gallery loads the index, not the bodies — the extension's panel deserialised the whole library on boot, and `JSON.parse` of megabytes of numeric sample arrays is the same freeze by a different route, filesystem or not.

### One model, three views

The invariant that makes this work: **the IR is the only writer of truth; all three views are pure derivations, and undo/redo is a stack of IR patches.**

| View | Derivation | Notes |
|---|---|---|
| **Canvas** (builder) | `CanvasNode[]` ← IR tree. Each emitted node carries `data-exelmj-c="<id>"`. Selection/drag/resize writes the IR; the DOM is a projection. | Because the builder **marks its own components at emit time**, the picker's entire detection heuristic (`paintScore`, `classify`, dedup) is *unnecessary* on our own output. Ground-truth boundaries, tier-1 selector stability, exact repatriation. |
| **Code** | `emit/html.ts` + `emit/css.ts` + `emit/ts.ts` read the IR. | The typed condition stack means real `@container`/`@layer` in the output; the token scope tree means `var(--brand)` instead of `#4f46e5`. Emit **animation longhands**, never the shorthand. |
| **Live preview** | Cheap: `<iframe sandbox="allow-scripts" srcdoc>` for gallery thumbnails. Real: the mini-browser guest loading `emit/` over `studio://`. | Two levels because 144 real WebContents is not a gallery. |

### The bridge to `DesignProject`

```ts
// src/studio/bridge/toDesign.ts
export function componentToArtboard(
  c: StudioComponent,
  shot: { png: Uint8Array; w: number; h: number; dpr: number },
  page: string
): { shapes: Shape[]; images: PlacedImage[]; texts: TextBox[] }
```

- Render the component in a **hidden guest** at a known width → `capturePage` → PNG.
- `pt = px * 0.75`, origin already top-left on both sides.
- Text runs → `TextBox` (the existing `align`/`direction` and `bidiRuns.ts` handling applies unchanged).
- Flat and gradient fills → `Shape` with the **existing** `gradient {x1,y1,x2,y2,from,to}`.
- Raster regions → `PlacedImage`, gated by the existing `IMAGE_DATA_URL` regex (PNG/JPEG only, because those are what pdf-lib embeds).
- Everything else → the existing `trace.ts` / `centerline.ts` / `curveFit.ts` pipeline.

**There is no reverse bridge.** A traced path has no states, no tokens, no DOM, no behaviour. Pretending Design → Studio round-trips would be exactly the kind of confident lie IDEAS #8 warns about.

---

## 4. THE MINI-BROWSER (deliverable d)

### `WebContentsView`, not `<webview>`

`webviewTag` is off in EXELMJ today and should stay off. `<webview>` is a renderer-owned custom element with an awkward async API, Electron's own docs discourage it, and — decisive here — **the renderer cannot reach `webContents.debugger` on it**, which kills every CDP capability the port depends on. `WebContentsView` gives main a real `webContents` with `.debugger`, `.setBounds`, `.capturePage`, `.setWindowOpenHandler`, and its own `session` partition.

The cost is honest: **we own layout, and the view paints above renderer DOM.** So:
- The renderer sends `studio:view-bounds {x,y,w,h}` on every panel resize/scroll (throttled to rAF).
- All chrome — toolbar, device pills, the inspect HUD mirror, the component gallery — lives **outside** the view rect. Nothing HTML may overlap it.
- Any modal that must cover the view does `removeChildView` (or `setBounds({height:0})`), not `z-index`.
- The view is owned **per `BrowserWindow`** and torn down in the existing `w.on('closed')` handler — EXELMJ already supports multiple windows via the `windows` Set, and a globally-owned guest would be silently stolen by a second window.

### The device switch — CDP, not `setDeviceEmulationParameters`

Both exist. `webContents.setDeviceEmulationParameters({screenPosition, screenSize, viewSize, deviceScaleFactor, scale})` needs no debugger, but **it does not set touch and does not set the user agent** — you get a smaller box while the page still believes it is a desktop with a mouse. The whole point of a tablet/mobile pill is that media queries, container queries, `pointer:coarse`, `hover:none` and touch events evaluate **for real**.

```ts
// electron/studio/device.ts
async function applyDevice(view: WebContentsView, d: Device) {
  const dbg = view.webContents.debugger
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: d.w, height: d.h, deviceScaleFactor: d.dpr, mobile: d.mobile,
    screenOrientation: { type: d.w > d.h ? 'landscapePrimary' : 'portraitPrimary',
                         angle: d.w > d.h ? 90 : 0 }
  })
  await dbg.sendCommand('Emulation.setTouchEmulationEnabled',
    { enabled: d.touch, maxTouchPoints: d.touch ? 5 : 0 })
  await dbg.sendCommand('Emulation.setUserAgentOverride',
    { userAgent: d.ua, platform: d.platform })
  await dbg.sendCommand('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme',   value: theme },
    { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }
  ]})
}
```

Then `view.setBounds(...)` letterboxes the guest so its CSS pixels are shown 1:1 (or scaled by *our* transform, never the guest's zoom, which would change what `devicePixelRatio` reports and corrupt every measurement).

**Two payoffs from choosing CDP:** the same `setDeviceMetricsOverride` call drives the breakpoint sweep (IDEAS #14) — the icon and the analysis share one code path — and `setEmulatedMedia` gives the dark-mode fork (IDEAS #10) empirically instead of analytically, plus it opens content hidden behind media queries, which is the exact case that defeated the author's class-guessing experiment. Keep `setDeviceEmulationParameters` as the no-debugger fallback for when the user has DevTools open (only one CDP client is allowed).

### Device catalogue

`src/studio/model/devices.ts` — a typed array, in the repo, offline:

```ts
export interface Device {
  id: string; label: string
  w: number; h: number; dpr: number
  mobile: boolean; touch: boolean
  ua: string; platform: string
}
```

Seeded by transcribing ~12 entries from Chromium's `emulated_devices` list (Chromium is BSD-licensed; we transcribe the handful we care about rather than vendoring the file). The three pills are pinned: **desktop 1440×900 @1, no touch** · **tablet 834×1112 @2, touch** · **mobile 390×844 @3, touch**. Behind them: the full catalogue, a free `custom W×H`, a **rotate** toggle (swap w/h), and — because we are Arabic-first — a **`dir` override** so the guest can be forced to RTL for testing without editing the generated project. Last choice persists per project in `studio.json`.

### How the picker reaches into the view — three layers, each with one job

**Do not pick one; they are not alternatives.**

1. **Guest preload — the control channel.** `webPreferences: { preload: <dist-electron/guestPreload.cjs>, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }`. Runs before any page script, on every navigation, in an isolated world the page cannot patch. Exposes exactly one namespaced object over `contextBridge`. **This replaces `ensureContentScript` entirely.**

2. **The picker agent — in the preload's isolated world.** An isolated world shares the DOM: `getComputedStyle`, `document.styleSheets`, `adoptedStyleSheets`, `cssRules`, `getBoundingClientRect`, `composedPath` all work there (Chrome content scripts do exactly this). So the overlay, the box-model math, the rule index, `ancestorContext`, `statesFor` and `collect()` **all run in the isolated world** — safer, and the page cannot patch what we read.

   **A correction to the readers' notes:** they suggested `webFrame.executeJavaScript(src, false)` from a context-isolated preload lands in the page's MAIN world. That is not reliable — with `contextIsolation: true`, `webFrame.executeJavaScript` runs in the *preload's* world. The dependable main-world route is CDP **`Page.addScriptToEvaluateOnNewDocument({source})` with no `worldName`**, which is the exact semantic equivalent of `world:'MAIN' + run_at:'document_start'`, applies to every frame, re-injects automatically on every navigation, and returns an identifier you can remove. Use it for the **only two things that genuinely need the main world**: `history.pushState`/`replaceState` suppression (a SPA router navigates without ever touching `location`, and there is no main-process block for it) and framework-fiber / `CSS.registerProperty` probes. Everything else stays isolated. *This ordering guarantee is on the unproven list in §6.*

3. **CDP — the capability layer.** `webContents.debugger.attach('1.3')`, opt-in per session, detached on error. It supplies the six things nothing else can: closed shadow roots and cross-origin frames (`DOM.getDocument({pierce:true})`), cross-origin stylesheet text (`CSS.getStyleSheetText`), the real accessibility tree (`Accessibility.getPartialAXTree`), cascade-ordered matched rules plus the inherited chain (`CSS.getMatchedStylesForNode`), forced pseudo-states (`CSS.forcePseudoState`), and the listener table (`DOMDebugger.getEventListeners`). Plus device metrics, network bodies, and `captureBeyondViewport` screenshots.

**Visual highlight:** DOM overlay by default (styleable with EXELMJ tokens, RTL hint bar, our own HUD), with CDP `Overlay.setInspectMode({mode:'searchForNode'})` + `Overlay.highlightNode` as the zero-cost fallback — it draws in the **compositor**, outside the page DOM, so there is no z-index war, the page cannot detect or remove it, and it works across iframes natively.

### Serving a generated project offline

Not a dev server, and **not `file://`**.

```ts
// before app.whenReady()
protocol.registerSchemeAsPrivileged([{
  scheme: 'studio',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}])

// after ready, on the GUEST session only
const guest = session.fromPartition('persist:studio-guest')
guest.protocol.handle('studio', async (req) => {
  const url = new URL(req.url)                       // studio://<projectId>/<path>
  const root = projectEmitDir(url.hostname)
  const target = path.join(root, decodeURIComponent(url.pathname))
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return new Response('', { status: 403 })
  return new Response(await fs.promises.readFile(target),
                      { headers: { 'content-type': mimeFor(target) } })
})
```

Why a privileged custom scheme: `secure: true` gives the page a **secure context** (modules, `crypto.subtle`, service workers); `standard: true` gives it a **real origin** so `localStorage`/IndexedDB/CORS behave like production. Offline, no port, no server process, no firewall prompt, no CORS surprises when the generated project is later deployed to `https://`.

Guest session lockdown, all of it:

```ts
guest.setPermissionRequestHandler((_wc, _p, cb) => cb(false))   // deny by default
guest.webRequest.onHeadersReceived(injectCspForOwnOrigin)
view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
view.webContents.on('will-navigate', (e, url) => { if (!allowed(url)) e.preventDefault() })
```

The **allowlist** (replacing `isInjectableUrl`'s blocklist): `studio://*`, `http://localhost:*` (for pointing at the user's own dev server), and any origin the user typed **and confirmed**. Blocked: `devtools://`, `chrome://`, `file://`. `about:blank` is a legitimate pre-navigation state for a fresh `WebContentsView` — the UI must say "load a page first", not "restricted".

---

## 5. THE MCP SURFACE (deliverable e)

### Transport: the server runs **inside** the Electron main process

Every tool needs live access to a `webContents`, an attached CDP session, and a project on disk — all of which live in main. Running the MCP server out-of-process adds an IPC hop to every call and creates a lifecycle problem (what happens to an in-flight tool call when the app quits).

- Main starts a **Streamable HTTP MCP transport** bound to `127.0.0.1` on an ephemeral port.
- A **per-launch bearer token** is written to `<userData>/studio/mcp.json` (mode 0600) alongside the port. **Loopback is not an authorization boundary** — any local process can hit it, so the token is not optional.
- Claude Code connects through a ~40-line stdio↔HTTP shim, `scripts/mcp-shim.mjs`, registered in `.mcp.json`. It reads that file, and if EXELMJ is not running it returns a clean `EXELMJ is not running` error instead of hanging.
- **Two channels, matching the extension's own split:** MCP **tools** = request/response (`ipcMain.handle`-shaped); MCP **notifications** = events (`studio/pick`, `studio/scan-progress`, `studio/navigated`, `studio/verify-result`).

### The tools

Every tool returns `{ ok: true, data } | { ok: false, code, detail }` — **errors as values, never thrown across the boundary**, ported verbatim from the extension's convention. Every read tool accepts `budgetTokens` and returns `dropped[]`.

```
studio.project.open      { path }                                    → { projectId, name, components }
studio.project.create    { path, name }                              → { projectId }

browser.open             { projectId?, url? }                        → { viewId, url }
browser.navigate         { viewId, url }                             → { url } | { code:'BLOCKED', origin }
browser.setDevice        { viewId, device:'desktop'|'tablet'|'mobile'|DeviceId,
                           rotate?: boolean, colorScheme?:'light'|'dark', dir?:'rtl'|'ltr' }
                                                                     → { w, h, dpr, mobile, touch, ua }
browser.screenshot       { viewId, selector?, fullPage?: boolean }    → { path, w, h }
browser.reload           { viewId }

picker.arm               { viewId, mode:'once'|'sticky' }             → { armed }
picker.pick              { viewId, selector? | point?:{x,y},
                           budgetTokens?: number }                    → { element, dropped[] }
picker.selectorFor       { viewId, backendNodeId }                    → ScopedSelector
picker.disarm            { viewId }

capture.component        { viewId, selector,
                           include?: ('states'|'motion'|'tokens'|'a11y'|'listeners')[] }
                                                                     → { componentId, degraded[] }
capture.scan             { viewId, limit?, budgetMs?, recordMotion?: false }
                                                                     → { found, scanned,
                                                                         dropped:{dupe,hidden,size},
                                                                         truncated, components[] }
capture.tokens           { viewId }                                   → TokenCensus
capture.breakpoints      { viewId, selector, widths?: number[] }      → { declared[], emergent[] }

library.list             { projectId, kind?, q? }                     → ComponentSummary[]
library.get              { projectId, componentId, budgetTokens? }    → { component, dropped[] }
library.remove           { projectId, componentId }

canvas.place             { projectId, page, componentId, x, y, w?, h? } → { nodeId }
canvas.list              { projectId, page }                          → CanvasNode[]
canvas.update            { projectId, nodeId, patch }                 → { ok }

emit.generate            { projectId, target:'html'|'ts', outDir? }   → { files[], warnings[] }
emit.verify              { projectId, componentId }                   → { verdict, diffs[] }

design.import            { projectId, componentId, artworkPath, page } → { shapes, images, texts }
```

Notes that are decisions, not documentation:

- **`picker.pick`'s return is the `collect()` shape, ported as a TypeScript interface.** It is a well-considered schema and the `readable`/`verbatim` distinction is a real insight preserved as two explicit output modes.
- **`capture.scan` defaults `recordMotion: false`.** Opting *in* to driving a page is the whole point of §6.
- **There is no `picker.click` and no `picker.type` tool.** An MCP server that lets a model click arbitrary things on the user's logged-in pages is the worst version of the recorder problem. If we ever add input driving it will be scoped to `studio://` origins only and named accordingly.
- **`redact()` runs in main, on the one function that serialises a `StudioComponent` to the wire.** Because the transport lives in main and the renderer has no provider network path, bypassing it is architecturally impossible rather than a matter of discipline.
- **The extension's ~40 message types are a validated inventory of what a page-inspection agent needs to expose** — but port the *inventory*, not the flat switch. Generate the tool manifest from the typed registry so there is no hand-maintained parallel list.

---

## 6. RISKS

### 1. The recorder dispatches real clicks — and in Electron they are TRUSTED. This is the serious one.

`webContents.sendInputEvent` and CDP `Input.dispatchMouseEvent` produce `isTrusted: true`. That is a genuine capability upgrade (real hit-testing, real `:hover` — which the extension could *never* make true — real pointer capture, real drag). It also **destroys the extension's entire safety model**: the capture-phase window guard that let trusted events through untouched and killed unaimed untrusted ones has no equivalent, because nothing inside the page can now tell our click from the user's. A trusted click really navigates, really submits, really pays.

The guard must be a layered cage **at the Electron layer, not the event layer**:

1. **Origin gate, hard.** The recorder runs **only on `studio://` origins** — code we generated — unless the user grants per-origin consent in a dialog that names the origin. The grant is recorded in `provenance.consent` and travels with the component.
2. **Network cage.** `session.webRequest.onBeforeRequest` cancels every non-`GET` for the duration, plus `details.resourceType === 'ping'` for beacons. This catches fetch, XHR, form posts, service-worker requests and beacons in one place the page cannot un-patch — code paths the monkey-patch misses entirely.
3. **Navigation cage.** `will-navigate` / `will-redirect` → `preventDefault()`. `setWindowOpenHandler` → deny. `did-navigate-in-page` (pushState) has **no main-process block** — keep the preload patch, and treat any slip as a **failed recording**, not a recoverable one.
4. **Static vetting, ported verbatim.** `clickUnsafe` with its fail-closed catch, whole-subtree 60-node scan, form/anchor/submit rejection, the bilingual `DESTRUCTIVE_RE`, and the rule that **delegated handlers do not count as evidence** — good enough to rank a component, explicitly not good enough to authorise a click.
5. **Dead-man timer in MAIN.** The extension's 8-second quiet-mode expiry lived *in the page it was protecting*; if the content script was torn down mid-recording the "off" never arrived. Ours lives in main, where a renderer crash cannot orphan it, and also clears on `did-navigate`, `render-process-gone` and window close. An armed `webRequest` filter left on by a skipped teardown silently breaks the user's mini-browser for the rest of the session.
6. **Block the user's input for the window.** `before-input-event` + an input-blocking scrim in the host renderer over the view rect, and a visible recording state. With trusted events, the extension's rule inverts: our input is real, so the *user's* must be suspended.

**My recommendation:** for third-party pages, **ship the automated recorder OFF** and build IDEAS #5 as originally specified — the user demonstrates, we observe (capture-phase listener, `composedPath`, before/after DOM + focus + top-layer diff). Automated driving is for `studio://` only, where a wrong verdict cannot buy anything.

One more thing worth knowing before anyone invests in the recorder: its measured yield on the reference site is **6 of 80 components producing exportable motion, while 77 of 80 carry real listener metadata.** The behaviour inventory is 13× more available than recordable motion. And the counter-intuitive result, tested twice including once with a 900-second budget to rule out starvation: **aiming at inner controls records LESS motion, not more** (6 → 0, and 6 → 1 on retry), because every extra press leaves the page in a state the components recorded afterwards no longer animate from.

### 2. CDP exclusivity

Only one debugger client per `webContents`. `debugger.attach()` throws if DevTools is open on the guest, and opening DevTools while attached is blocked. Every CDP-dependent capability degrades silently otherwise. Required behaviour: attach lazily, catch, **push a `Degradation` into `provenance.degraded`**, surface it in the panel, and offer "close DevTools to enable deep capture". Do not let a failed attach look like a successful shallow capture.

### 3. Performance — with numbers

- Motion sampling: **22 properties × up to 32 nodes × ~70 frames ≈ 50,000 `getPropertyValue` calls per phase**, each forcing style recalculation. That is the entire budget of the pass. **Do not move it to CDP `CSS.getComputedStyleForNode`** — far slower. Sample in-page, stream once.
- Rule index on a Tailwind sheet: ~20k rules. The token pre-filter is what makes it linear rather than quadratic.
- `DOM.getDocument({pierce:true, depth:-1})` on a large page is a large payload over the debugger channel — scope it to the component subtree via `DOM.describeNode`.
- Port every budget cap as a named constant, not a magic number.
- Run scans in a **hidden** `WebContentsView` with `backgroundThrottling: false` so a stall never freezes visible UI. **Residual risk:** `backgroundThrottling:false` is not an ironclad guarantee for an occluded window on Windows. Keep the ported rAF-vs-`setTimeout(40)` race — every unguarded rAF wait in the source was added after a real hang — and report `truncated` rather than hanging.

### 4. Genuinely unproven in Electron

- **Ordering between a `sandbox:true` guest preload and `Page.addScriptToEvaluateOnNewDocument`.** I believe both run before page script; which runs *first* needs a test before the injection design is locked.
- **`CSS.forcePseudoState` + `capturePage` as a verification oracle against a `WebContentsView`.** The author only ever ran his harness against headless Chrome over CDP from outside.
- **`studio://` with `secure:true` and a service worker**, if a generated project ever registers one.
- **`WebContentsView` lifecycle against EXELMJ's multi-window design** (`windows: Set<BrowserWindow>`, `win` tracking the focused one). The guest must be per-window or a second window silently steals it.
- **The Illustrator COM round-trip is already the one unproven thing in EXELMJ** (per the project's own memory note, 2026-08-13). The Studio→Design bridge sits downstream of it — **do not let Studio's schedule depend on it.**

### 5. Security of the artifact path

Our output goes to **disk** and is then **loaded by our own guest with a preload attached**. An `inert()` escape is no longer "a broken paste" — it is untrusted page-derived text reaching a Node-adjacent context. Mitigations: emit **separate files**, never concatenate; keep `inert()` extended (`</textarea`, `</title`, `</xmp`, `]]>`, U+2028/9) as belt-and-braces; validate every path at the `ipcMain` boundary with `path.relative` containment; sanitise filenames against `..`, drive letters and Windows reserved names. And carry the source's doctrine: **the page's world is not a trust boundary; validate at the point of USE, not the point of transfer** — drop event types that fail `SAFE_EVENT_RE` rather than escaping them, because there is no legitimate `</style>` in an event type.

### 6. Redaction is a launch blocker

Saying it twice on purpose. The extension shipped without it; its element picks reach the model completely unredacted. This is the only part of the product where a bug is a **security incident** rather than a bad output. Include the Arabic-Indic digit rule — mandatory, not optional, for this product.

### 7. Scope

The source is ~550 KB of JavaScript built over months by someone who measured everything he did. Porting "all of it" is a year. The plan above must ship a vertical slice that is useful alone.

**Suggested v1 cut** (the author's own four-feature recommendation, adapted, plus the two things only we can do): **IR + guest + injection lifecycle** → **picker overlay + scoped selectors** → **rule index + ancestor context** → **State Ghost** → **token census** → **device switch** → **redaction gate**. That is items 1–10, 15 and 18, ≈ 6–8 weeks. It already contains a capability no competitor has and a differentiator the extension never got (a real viewport).

---

## 7. WHAT I WOULD NOT BUILD

**Not our product** — roughly 1900 of `sidepanel.js`'s 4099 lines plus ~150 of `background.js`:
- The Arabic dialect corpus harvester.
- The security scanner, bounty-report generator and Supabase RLS prober.
- The bulk API fetcher and pagination crawler.
- Whole-site clone-to-ZIP.

**The AI provider layer specifically — and here is the argument.** `runAi`, `listAiModels`, `aiErrorHint`, the endpoint presets, the provider radio buttons, the "test connection" button, the key storage: every line of it exists because the extension's client was **a human clicking a button in a side panel**. To answer "what should I call this colour scale", something had to call a model, which meant a key, an endpoint, a three-shape provider matrix, CORS headers (`anthropic-dangerous-direct-browser-access` exists *only* because the request came from a browser origin), timeouts and billing. **In Studio the topology inverts: Claude is the client.** Claude calls our MCP tools, reasons in its own context with its own billing, and calls back. The cost of dropping this is zero for anything Claude is present for — which is the entire designed workflow.

Three residual cases, stated honestly: headless overnight batch work (better served by a scheduled MCP run); shipping Studio to someone without Claude Code (a product decision, not today's); and bulk mechanical labour like naming 400 tokens where we would not want to burn the driving agent's context (**the only real engineering argument**). So: define a one-method `LlmPort.complete(messages, opts)` whose **default implementation returns the data to the MCP caller** and lets Claude answer. Leave `HttpProviderPort` unimplemented behind a settings flag. If it is ever built, paste in `aiExtractText` and `aiEmptyReason` verbatim — those ~40 lines encode field knowledge you cannot get from any provider's documentation.

**Not in v1:**
- **Cascade ablation (IDEAS #17)** — explicitly gated behind a verification pass that does not exist yet, and the author's own 144-phantom-defect run is the proof of what happens if you skip that gate.
- **Scrollprint (IDEAS #20)** — lowest value for us of the tier-three ideas.
- **Semantic capture diff (IDEAS #12)** — cheap *after* the IR exists (the IR is the thing to hash), pointless before.
- **Automated motion recording on third-party pages** — build the user-demonstrated version instead.
- **A React/Vue/Svelte code generator.** v1 emits **HTML + CSS + vanilla TS**, which is what EXELMJ itself is written in and what "code we own" means here. Framework emitters are a later plug-in against the same IR, not a v1 constraint on the IR's shape.

**Never:**
- **The reverse bridge Design → Studio.** A traced path is not a component.
- **XPath as a default output.** It doubles the addressing surface for very little benefit once our own builder emits stable attributes. Opt-in at most, and fix its two defects if built (the id fast path verifies nothing and does not escape a `"`).
- **The `html`-only output format.** It is a strictly worse JSON, it discards the selector, xpath, metrics, tailwind, attributes, accessibility and contrast verdict, and it is the one a user picks by accident and then wonders why the AI is useless. Replace it with a "copy markup" button on the always-complete payload.
- **The clipboard as the primary channel.** In the extension, clipboard-then-paste-into-ChatGPT *was* the product. Here the pick flows structurally — into the builder's node model and out of MCP. Keep `copy()` as one convenience action; delete the `execCommand` fallback entirely (`clipboard.writeText` from main has no permission, secure-context or user-activation requirement).
- **Icon mirroring machinery.** Copy the extension's better answer: it ships 24 glyphs chosen to be symmetric or vertical, so `transform: scaleX(-1)` appears **zero times in 39 KB of RTL CSS**. The one asymmetric glyph (`</>`) is semantically LTR and must not mirror. Choose the icon set so mirroring is unnecessary rather than handling it afterwards.

---

### One last carry-over, because it is the cheapest thing in this document

The source's RTL system is directly reusable and better than most: `dir="rtl"` declared at `<html>` and `body`, layout built from flex/grid so it mirrors for free, logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`) for chrome, and **`direction: ltr` scoped to the RUN of machine text, never its container** — 22 separate islands for selectors, hex codes, URLs, font names, filenames. Two details worth stealing outright: `direction: ltr + text-align: right` for a Latin token inside an Arabic card (correct, and not obvious), and `dir="ltr"` on the toggle/number-input **element** so its physical knob geometry is direction-independent. Mixed strings are segmented into `<span class="num">` rather than using bidi control characters, and counts use `toLocaleString('en')` — Western digits, deliberately, for a developer tool.

Two things to fix while porting: `.asset__badge{right:5px}` and `.asset__label{left:5px}` use physical offsets where the sibling rule correctly uses `inset-inline-end`; and the Google Fonts `<link>` must become a bundled woff2 — EXELMJ is offline and a CSP will block it.