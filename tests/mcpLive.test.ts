// A REAL server, over a REAL socket. The dispatch tests prove the protocol
// logic; these prove the thing a client actually connects to — the bind
// address, the auth gate, the body limit and the notification behaviour. Those
// are exactly the parts that cannot be checked by calling a function.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { connectionFilePath, startMcpServer, type RunningServer } from '../electron/studio/mcpServer'
import type { ToolResult } from '../electron/studio/mcpProtocol'

let server: RunningServer
let dir: string
let lastCall: { name: string; args: Record<string, unknown> } | null = null

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'exelmj-mcp-'))
  server = await startMcpServer({
    userDataDir: dir,
    appVersion: '0.2.2',
    callTool: async (name, args): Promise<ToolResult> => {
      lastCall = { name, args }
      if (name === 'studio_status') return { ok: true, data: { running: true } }
      return { ok: false, code: 'NOT_FOUND', detail: 'nope' }
    }
  })
})

afterAll(async () => {
  await server?.close()
  await rm(dir, { recursive: true, force: true })
})

const url = (): string => `http://127.0.0.1:${server.port}/`

async function rpc(body: unknown, token = server.token, method = 'POST'): Promise<Response> {
  return fetch(url(), {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  })
}

describe('the connection file', () => {
  it('is written with the port and a token', async () => {
    const raw = JSON.parse(await readFile(connectionFilePath(dir), 'utf8'))
    expect(raw.port).toBe(server.port)
    expect(raw.token).toBe(server.token)
    expect(typeof raw.pid).toBe('number')
  })

  it('carries a token long enough to be a credential', () => {
    expect(server.token.length).toBeGreaterThanOrEqual(32)
  })
})

describe('the auth gate — loopback is not an authorization boundary', () => {
  it('refuses a request with no token', async () => {
    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    })
    expect(res.status).toBe(401)
  })

  it('refuses a wrong token', async () => {
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'wrong')).status).toBe(401)
  })

  it('accepts the right one', async () => {
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' })).status).toBe(200)
  })

  it('refuses a non-POST method', async () => {
    expect((await rpc(null, server.token, 'GET')).status).toBe(405)
  })

  it('sends NO CORS header — a web page must never reach this', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(res.headers.get('access-control-allow-origin')).toBe(null)
  })
})

describe('the protocol over the wire', () => {
  it('initializes', async () => {
    const body = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' })).json()
    expect(body.result.serverInfo.name).toBe('exelmj-studio')
    expect(body.id).toBe(1)
  })

  it('lists tools', async () => {
    const body = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
    expect(body.result.tools.length).toBeGreaterThan(5)
  })

  it('calls a tool and forwards the arguments', async () => {
    const body = await (
      await rpc({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'studio_status', arguments: { x: 1 } }
      })
    ).json()
    expect(lastCall).toEqual({ name: 'studio_status', args: { x: 1 } })
    expect(JSON.parse(body.result.content[0].text).running).toBe(true)
  })

  it('returns a tool failure as a readable result, not an HTTP error', async () => {
    const res = await rpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'studio_get_tokens', arguments: {} }
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('NOT_FOUND')
  })

  it('answers a NOTIFICATION with 202 and an empty body', async () => {
    const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('')
  })

  it('reports a parse error rather than crashing', async () => {
    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${server.token}` },
      body: '{{{not json'
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(-32700)
  })

  it('rejects an oversized body instead of buffering it', async () => {
    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${server.token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping', params: { pad: 'x'.repeat(2_000_000) } })
    })
    expect(res.status).toBe(413)
  })
})

describe('shutdown', () => {
  it('removes the connection file, so a client says "not running" rather than "connection refused"', async () => {
    const dir2 = await mkdtemp(path.join(tmpdir(), 'exelmj-mcp2-'))
    const s = await startMcpServer({
      userDataDir: dir2,
      appVersion: '0.0.0',
      callTool: async () => ({ ok: true, data: null })
    })
    await readFile(connectionFilePath(dir2), 'utf8')
    await s.close()
    await expect(readFile(connectionFilePath(dir2), 'utf8')).rejects.toThrow()
    await rm(dir2, { recursive: true, force: true })
  })
})
