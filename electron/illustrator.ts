// The Illustrator bridge — Adobe's OWN supported automation, nothing else.
//
// Why this exists: a .ai file keeps its editable state in Adobe's private
// AIPrivateData stream. We do not (and legally may not) reverse-engineer it.
// Instead we ask the INSTALLED Illustrator to open the file and hand us its
// text through Adobe's documented ExtendScript/COM interface. Everything runs
// offline on the user's machine.
//
// Transport (chosen after live verification on AI 2026 / 30.3.0):
//   COM `Illustrator.Application` → DoJavaScriptFile, driven by a spawned
//   PowerShell shim. COM auto-launches Illustrator, works whether it is closed
//   or already open, and — unlike an in-process native binding — the shim can
//   be SIGKILLed if Illustrator throws a modal dialog (the #1 hang risk).
//
// Arabic: the JSX writes PURE ASCII JSON (every non-ASCII char as \uXXXX), so
// no layer in the chain (ExtendScript writer → PowerShell console codepage →
// Node read) can corrupt it. Text is taken from textFrame.contents — the
// LOGICAL string — never from Illustrator's SVG export, which is documented to
// reverse Arabic.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface AiTextRun {
  text: string
  /** pt from the artboard's LEFT edge */
  x: number
  /** pt from the artboard's TOP edge */
  y: number
  width: number
  height: number
  size: number
  color: string
  font: string
  dir: 'rtl' | 'ltr'
}

export interface AiExtractResult {
  ok: boolean
  runs: AiTextRun[]
  /** counts of text our extraction cannot reach (symbols, plugin art, …) */
  unreachable: Record<string, number>
  artboards: number
  error?: string
}

// ---------------------------------------------------------------- detection
/**
 * COM scriptability is the only check that predicts success: resolve the
 * ProgID → CLSID → LocalServer32, which yields both the proof and the exe
 * path. Modern Illustrator writes no per-product HKLM key at all.
 */
export function detectIllustrator(): { installed: boolean; exePath?: string; progId?: string } {
  try {
    const out = runPowerShellSync(`
$ErrorActionPreference='SilentlyContinue'
New-PSDrive -Name HKCR -PSProvider Registry -Root HKEY_CLASSES_ROOT | Out-Null
$clsid = (Get-ItemProperty 'HKCR:\\Illustrator.Application\\CLSID').'(default)'
if (-not $clsid) { Write-Output 'NONE'; exit 0 }
$server = (Get-ItemProperty ("HKCR:\\CLSID\\" + $clsid + "\\LocalServer32")).'(default)'
$cur = (Get-ItemProperty 'HKCR:\\Illustrator.Application\\CurVer').'(default)'
Write-Output ("OK|" + $server + "|" + $cur)
`)
    const line = out.split(/\r?\n/).find((l) => l.startsWith('OK|'))
    if (!line) return { installed: false }
    const [, server, progId] = line.split('|')
    const exePath = (server ?? '').replace(/\s*\/Automation\s*$/i, '').replace(/^"|"$/g, '').trim()
    if (!exePath || !fs.existsSync(exePath)) return { installed: false }
    return { installed: true, exePath, progId: (progId ?? '').trim() }
  } catch {
    return { installed: false }
  }
}

function runPowerShellSync(script: string): string {
  const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 }
  )
}

// ------------------------------------------------------------------- script
/**
 * ExtendScript run INSIDE Illustrator. Notes that matter:
 * - doc.textFrames is ALREADY flattened across layers/groups — never recurse.
 * - Coordinates are normalized against the artboard rect, so the result is
 *   origin-top-left like PDF/SVG regardless of Illustrator's y-up DOM and the
 *   app.coordinateSystem setting.
 * - Alerts are suppressed and OUR document is closed without saving; the
 *   user's own open documents are never touched.
 */
const EXTRACT_JSX = String.raw`#target illustrator
(function () {
  var OUT = "__OUT__", IN_AI = "__IN__";
  function esc(s) {
    var out = "", i, c, code;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i); code = s.charCodeAt(i);
      if (c === '"') out += '\\"';
      else if (c === '\\') out += '\\\\';
      else if (code === 10) out += '\\n';
      else if (code === 13) out += '\\r';
      else if (code === 9) out += '\\t';
      else if (code < 32 || code > 126) {
        var h = code.toString(16); while (h.length < 4) h = "0" + h;
        out += "\\u" + h;
      } else out += c;
    }
    return out;
  }
  function num(n) { return (isNaN(n) || !isFinite(n)) ? 0 : Math.round(n * 100) / 100; }
  function hex2(v) { v = Math.round(v); if (v < 0) v = 0; if (v > 255) v = 255; var h = v.toString(16); return h.length < 2 ? "0" + h : h; }
  function colorOf(c) {
    try {
      if (!c) return "#111111";
      if (c.typename === "RGBColor") return "#" + hex2(c.red) + hex2(c.green) + hex2(c.blue);
      if (c.typename === "GrayColor") { var g = Math.round(255 * (1 - c.gray / 100)); return "#" + hex2(g) + hex2(g) + hex2(g); }
      if (c.typename === "CMYKColor") {
        var r = 255 * (1 - Math.min(1, c.cyan / 100 + c.black / 100));
        var g2 = 255 * (1 - Math.min(1, c.magenta / 100 + c.black / 100));
        var b = 255 * (1 - Math.min(1, c.yellow / 100 + c.black / 100));
        return "#" + hex2(r) + hex2(g2) + hex2(b);
      }
      if (c.typename === "SpotColor" && c.spot && c.spot.color) return colorOf(c.spot.color);
    } catch (e) {}
    return "#111111";
  }
  function isArabic(s) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) ||
          (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) return true;
    }
    return false;
  }

  var prevLevel = null, doc = null, opened = false, parts = [], err = "";
  var unreachable = { symbols: 0, plugins: 0, placed: 0, legacy: 0, nonNative: 0 };
  var boards = 1;
  try {
    prevLevel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    doc = app.open(new File(IN_AI));
    opened = true;
    boards = doc.artboards.length;
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    try { unreachable.symbols = doc.symbolItems.length; } catch (e) {}
    try { unreachable.plugins = doc.pluginItems.length; } catch (e) {}
    try { unreachable.placed = doc.placedItems.length; } catch (e) {}
    try { unreachable.legacy = doc.legacyTextItems.length; } catch (e) {}
    try { unreachable.nonNative = doc.nonNativeItems.length; } catch (e) {}

    var frames = doc.textFrames; // already flattened across groups/layers
    var limit = Math.min(frames.length, 3000);
    for (var i = 0; i < limit; i++) {
      var tf = frames[i];
      var contents = "";
      try { contents = tf.contents; } catch (e) { continue; }
      if (!contents || !contents.replace(/^\s+|\s+$/g, "").length) continue;
      var g;
      try { g = tf.geometricBounds; } catch (e) { continue; }
      var size = 12, color = "#111111", font = "";
      try { size = tf.textRange.characterAttributes.size; } catch (e) {}
      try { color = colorOf(tf.textRange.characterAttributes.fillColor); } catch (e) {}
      try { font = tf.textRange.characterAttributes.textFont.name; } catch (e) {}
      parts.push(
        '{"text":"' + esc(contents) + '"' +
        ',"x":' + num(g[0] - ab[0]) +
        ',"y":' + num(ab[1] - g[1]) +
        ',"width":' + num(g[2] - g[0]) +
        ',"height":' + num(g[1] - g[3]) +
        ',"size":' + num(size) +
        ',"color":"' + esc(color) + '"' +
        ',"font":"' + esc(font) + '"' +
        ',"dir":"' + (isArabic(contents) ? "rtl" : "ltr") + '"}'
      );
    }
  } catch (e) {
    err = "" + e;
  }
  try { if (opened && doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
  try { if (prevLevel !== null) app.userInteractionLevel = prevLevel; } catch (e) {}

  var json = '{"ok":' + (err ? "false" : "true") +
    ',"artboards":' + boards +
    ',"unreachable":{"symbols":' + unreachable.symbols + ',"plugins":' + unreachable.plugins +
    ',"placed":' + unreachable.placed + ',"legacy":' + unreachable.legacy +
    ',"nonNative":' + unreachable.nonNative + '}' +
    (err ? ',"error":"' + esc(err) + '"' : "") +
    ',"runs":[' + parts.join(",") + ']}';
  var f = new File(OUT);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(json);
  f.close();
  var done = new File(OUT + ".done");
  done.open("w"); done.write("1"); done.close();
  return err ? "ERR" : "OK";
})();
`

const SHIM_PS1 = String.raw`param(
  [Parameter(Mandatory=$true)][string]$Jsx,
  [int]$TimeoutSec = 180
)
$ErrorActionPreference = 'Stop'
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$ai = $null
while ($null -eq $ai) {
  try { $ai = New-Object -ComObject Illustrator.Application }
  catch {
    if ((Get-Date) -gt $deadline) { Write-Output 'ERR:LAUNCH_TIMEOUT'; exit 3 }
    Start-Sleep -Milliseconds 1000
  }
}
while ($true) {
  try { $res = $ai.DoJavaScriptFile($Jsx); break }
  catch [System.Runtime.InteropServices.COMException] {
    $hr = $_.Exception.HResult
    if (($hr -eq -2147417846 -or $hr -eq -2147418111) -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 750; continue
    }
    Write-Output ("ERR:COM 0x{0:X8}" -f $hr); exit 4
  }
  catch { Write-Output ("ERR:" + $_.Exception.Message); exit 5 }
}
Write-Output ("RES:" + [string]$res)
try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ai) } catch {}
exit 0
`

// --------------------------------------------------------------- extraction
/**
 * Ask Illustrator for the file's text. Never throws; always resolves with a
 * result the renderer can show. Uses an ASCII-only temp dir with forward
 * slashes — ExtendScript's File() URI-decodes its argument and breaks on
 * %, #, + and non-ASCII paths (an Arabic Windows username would break it).
 */
export async function extractWithIllustrator(aiPath: string, timeoutMs = 180000): Promise<AiExtractResult> {
  const fail = (error: string): AiExtractResult => ({
    ok: false,
    runs: [],
    unreachable: {},
    artboards: 0,
    error
  })
  const found = detectIllustrator()
  if (!found.installed) return fail('NOT_INSTALLED')

  const dir = path.join(os.tmpdir(), 'exelmj-ai')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    return fail('TEMP_DIR')
  }
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const jsxPath = path.join(dir, `extract-${stamp}.jsx`)
  const outPath = path.join(dir, `out-${stamp}.json`)
  const shimPath = path.join(dir, `shim-${stamp}.ps1`)
  const fwd = (p: string) => p.replace(/\\/g, '/')

  const cleanup = () => {
    for (const f of [jsxPath, outPath, `${outPath}.done`, shimPath]) {
      try {
        fs.rmSync(f, { force: true })
      } catch {
        // best effort
      }
    }
  }

  try {
    const jsx = EXTRACT_JSX.replace('__OUT__', fwd(outPath)).replace('__IN__', fwd(aiPath))
    fs.writeFileSync(jsxPath, jsx, 'utf8')
    fs.writeFileSync(shimPath, SHIM_PS1, 'utf8')
  } catch {
    cleanup()
    return fail('WRITE_TEMP')
  }

  const shimOut = await new Promise<string>((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        shimPath,
        '-Jsx',
        jsxPath,
        '-TimeoutSec',
        String(Math.floor(timeoutMs / 1000))
      ],
      { windowsHide: true }
    )
    let out = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (out += String(d)))
    const killer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
      resolve('ERR:TIMEOUT')
    }, timeoutMs + 15000)
    child.on('error', () => {
      clearTimeout(killer)
      resolve('ERR:SPAWN')
    })
    child.on('close', () => {
      clearTimeout(killer)
      resolve(out)
    })
  })

  // the JSX writes a .done sentinel — antivirus can delay visibility briefly
  let raw: string | null = null
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(`${outPath}.done`) && fs.existsSync(outPath)) {
      try {
        raw = fs.readFileSync(outPath, 'utf8')
      } catch {
        raw = null
      }
      if (raw) break
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  cleanup()

  if (!raw) {
    const m = /ERR:[^\r\n]*/.exec(shimOut)
    return fail(m ? m[0] : 'NO_OUTPUT')
  }
  try {
    const parsed = JSON.parse(raw.replace(/^﻿/, '')) as AiExtractResult
    if (!Array.isArray(parsed.runs)) return fail('BAD_JSON')
    return parsed
  } catch {
    return fail('BAD_JSON')
  }
}
