// The device catalogue behind the desktop / tablet / mobile switch.
//
// WHY A DEVICE IS MORE THAN A WIDTH
// Making the preview narrower is not previewing a phone. A phone reports a
// device pixel ratio (so `2x` images and `image-set()` resolve differently), a
// touch-capable pointer (so `@media (pointer: coarse)` and `(hover: none)`
// match, which is what turns hover menus into tap menus), and a mobile user
// agent (which server-side and JS feature detection both key off). A viewport
// that lies about those three shows a desktop layout squeezed into a phone
// width — the exact bug the switch exists to catch.
//
// The numbers are transcribed from Chromium's own emulated-device list
// (BSD-licensed) for the handful we ship, rather than vendoring the whole file.

export interface Device {
  id: string
  /** shown on the pill */
  label: string
  /** the class the icon comes from */
  kind: 'desktop' | 'tablet' | 'mobile'
  w: number
  h: number
  dpr: number
  /** drives Emulation.setDeviceMetricsOverride's `mobile` flag: it changes
   * viewport meta handling, text autosizing and scrollbar behaviour */
  mobile: boolean
  touch: boolean
  ua: string
  platform: string
}

const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

/** The three pinned pills, in the order they appear. */
export const DESKTOP: Device = {
  id: 'desktop',
  label: 'Desktop',
  kind: 'desktop',
  w: 1440,
  h: 900,
  dpr: 1,
  mobile: false,
  touch: false,
  ua: UA_DESKTOP,
  platform: 'Win32'
}

export const TABLET: Device = {
  id: 'tablet',
  label: 'Tablet',
  kind: 'tablet',
  w: 834,
  h: 1112,
  dpr: 2,
  mobile: true,
  touch: true,
  ua: UA_IPAD,
  platform: 'iPad'
}

export const MOBILE: Device = {
  id: 'mobile',
  label: 'Mobile',
  kind: 'mobile',
  w: 390,
  h: 844,
  dpr: 3,
  mobile: true,
  touch: true,
  ua: UA_IPHONE,
  platform: 'iPhone'
}

export const PINNED: Device[] = [DESKTOP, TABLET, MOBILE]

/** The fuller list behind the three pills. */
export const CATALOGUE: Device[] = [
  DESKTOP,
  { ...DESKTOP, id: 'desktop-hd', label: 'Desktop HD', w: 1920, h: 1080 },
  { ...DESKTOP, id: 'laptop', label: 'Laptop', w: 1280, h: 800 },
  { ...DESKTOP, id: 'macbook', label: 'MacBook Pro 14', w: 1512, h: 982, dpr: 2, platform: 'MacIntel' },
  TABLET,
  { ...TABLET, id: 'ipad-pro', label: 'iPad Pro 12.9', w: 1024, h: 1366 },
  {
    ...TABLET,
    id: 'android-tablet',
    label: 'Android Tablet',
    w: 800,
    h: 1280,
    dpr: 2,
    ua: UA_ANDROID,
    platform: 'Linux armv8l'
  },
  MOBILE,
  { ...MOBILE, id: 'iphone-se', label: 'iPhone SE', w: 375, h: 667, dpr: 2 },
  { ...MOBILE, id: 'iphone-pro-max', label: 'iPhone 15 Pro Max', w: 430, h: 932 },
  {
    ...MOBILE,
    id: 'pixel',
    label: 'Pixel 8',
    w: 412,
    h: 915,
    dpr: 2.625,
    ua: UA_ANDROID,
    platform: 'Linux armv8l'
  },
  {
    ...MOBILE,
    id: 'galaxy-s',
    label: 'Galaxy S23',
    w: 360,
    h: 780,
    dpr: 3,
    ua: UA_ANDROID,
    platform: 'Linux armv8l'
  }
]

export function deviceById(id: string): Device | null {
  return CATALOGUE.find((d) => d.id === id) ?? null
}

/** Swap width and height. Orientation is not a separate device. */
export function rotate(d: Device): Device {
  return { ...d, w: d.h, h: d.w }
}

/** A free size the user typed. Kept in the catalogue's shape so every consumer
 * treats it identically — a custom size that took a different code path would
 * be the one that skips the touch and UA overrides. */
export function custom(w: number, h: number): Device {
  const cw = Math.max(1, Math.round(w))
  const ch = Math.max(1, Math.round(h))
  // Below the common tablet breakpoint a custom size is far more likely to be
  // a phone than a small window, and getting `mobile` wrong is the whole bug
  // this module exists to prevent.
  //
  // There is deliberately NO `base` parameter to start from another device:
  // spreading one over the classified source is exactly how a 360-wide
  // "custom" ends up reporting no touch — the classification has to win.
  const kind: Device['kind'] = cw < 768 ? 'mobile' : cw < 1024 ? 'tablet' : 'desktop'
  const src = kind === 'mobile' ? MOBILE : kind === 'tablet' ? TABLET : DESKTOP
  return { ...src, id: 'custom', label: `${cw}x${ch}`, kind, w: cw, h: ch }
}

/**
 * The exact CDP payloads for a device.
 *
 * Kept as DATA rather than as calls so it is testable without Electron, and so
 * the main process has nothing to decide — the mapping from "the user pressed
 * the phone pill" to "what the page believes" lives here, in one readable
 * place, and is unit-tested.
 *
 * setDeviceEmulationParameters (the non-CDP route) is deliberately NOT used:
 * it resizes the viewport but sets neither touch nor the user agent, so the
 * page gets a smaller box while still believing it is a desktop with a mouse.
 */
export function emulationCommands(
  d: Device,
  opts: { colorScheme?: 'light' | 'dark'; reducedMotion?: boolean } = {}
): Array<{ method: string; params: Record<string, unknown> }> {
  const landscape = d.w > d.h
  return [
    {
      method: 'Emulation.setDeviceMetricsOverride',
      params: {
        width: d.w,
        height: d.h,
        deviceScaleFactor: d.dpr,
        mobile: d.mobile,
        screenOrientation: {
          type: landscape ? 'landscapePrimary' : 'portraitPrimary',
          angle: landscape ? 90 : 0
        }
      }
    },
    {
      method: 'Emulation.setTouchEmulationEnabled',
      params: { enabled: d.touch, maxTouchPoints: d.touch ? 5 : 0 }
    },
    {
      method: 'Emulation.setUserAgentOverride',
      params: { userAgent: d.ua, platform: d.platform }
    },
    {
      method: 'Emulation.setEmulatedMedia',
      params: {
        features: [
          { name: 'prefers-color-scheme', value: opts.colorScheme ?? 'light' },
          { name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }
        ]
      }
    }
  ]
}

/** The commands that put everything back. */
export function clearCommands(): Array<{ method: string; params: Record<string, unknown> }> {
  return [
    { method: 'Emulation.clearDeviceMetricsOverride', params: {} },
    { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: false, maxTouchPoints: 0 } },
    { method: 'Emulation.setUserAgentOverride', params: { userAgent: UA_DESKTOP, platform: 'Win32' } },
    { method: 'Emulation.setEmulatedMedia', params: { features: [] } }
  ]
}

/**
 * The widths a responsive sweep should test.
 *
 * The common framework breakpoints plus every catalogue width, deduped and
 * sorted. Sweeping arbitrary widths finds nothing; sweeping the widths real
 * stylesheets actually branch at is what surfaces a broken layout.
 */
export function sweepWidths(extra: number[] = []): number[] {
  const breakpoints = [320, 360, 375, 390, 414, 480, 640, 768, 834, 1024, 1280, 1440, 1536, 1920]
  const all = new Set<number>([...breakpoints, ...CATALOGUE.map((d) => d.w), ...extra])
  return [...all].filter((w) => w > 0).sort((a, b) => a - b)
}
