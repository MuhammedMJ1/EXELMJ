#!/usr/bin/env node
// stdio -> local HTTP bridge for the EXELMJ Studio MCP server.
//
// Claude Code and Claude Desktop launch an MCP server as a child process and
// speak newline-delimited JSON-RPC over stdio. Our server lives inside the
// running Electron app (it needs the open document, a live webContents and a
// CDP session), so this shim reads the connection file the app writes and
// forwards each request to it.
//
// The one behaviour that matters most here: when EXELMJ is NOT running, this
// must fail FAST and legibly. A shim that hangs makes the client wait on a
// dead server and the user sees a spinner with no explanation.

import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import os from 'node:os'
import path from 'node:path'

const APP_DIR = process.env.EXELMJ_USER_DATA ?? path.join(os.homedir(), 'AppData', 'Roaming', 'EXELMJ')
const CONN = path.join(APP_DIR, 'studio', 'mcp.json')

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)

const errorResult = (id, text) => ({
  jsonrpc: '2.0',
  id,
  result: { content: [{ type: 'text', text }], isError: true }
})

async function connection() {
  const raw = await readFile(CONN, 'utf8')
  const { port, token } = JSON.parse(raw)
  if (!port || !token) throw new Error('incomplete connection file')
  return { port, token }
}

async function forward(msg) {
  const { port, token } = await connection()
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(msg),
    // A tool call can legitimately take a while (a trace, a screenshot), but
    // not forever — an unbounded wait is indistinguishable from a hang.
    signal: AbortSignal.timeout(120_000)
  })
  if (res.status === 202) return null
  if (!res.ok) throw new Error(`server returned ${res.status}`)
  return res.json()
}

const rl = createInterface({ input: process.stdin, terminal: false })

rl.on('line', (line) => {
  const text = line.trim()
  if (!text) return
  let msg
  try {
    msg = JSON.parse(text)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })
    return
  }
  void (async () => {
    try {
      const reply = await forward(msg)
      if (reply !== null) send(reply)
    } catch (e) {
      const isMissing = e && (e.code === 'ENOENT' || String(e.message).includes('ENOENT'))
      const detail = isMissing
        ? 'EXELMJ is not running. Start EXELMJ, open a design, and try again.'
        : `Could not reach EXELMJ: ${e instanceof Error ? e.message : String(e)}`
      // A NOTIFICATION has no id and must never be answered, even to report an
      // error — replying to one is a protocol violation.
      if (msg.id === undefined || msg.id === null) return
      send(errorResult(msg.id, detail))
    }
  })()
})

rl.on('close', () => process.exit(0))
