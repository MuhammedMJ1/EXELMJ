// The MCP server, hosted inside the Electron main process.
//
// TRANSPORT: Streamable HTTP on 127.0.0.1, ephemeral port, per-launch bearer
// token written to <userData>/studio/mcp.json. See mcpProtocol.ts for why this
// and not stdio (utilityProcess cannot have stdin) and why the token is not
// optional (loopback is not an authorization boundary).
//
// The server owns no state of its own: every tool call is forwarded to the
// renderer that actually holds the document, and the renderer answers over the
// existing IPC channel. That keeps ONE source of truth — the open document —
// rather than a second copy in main that could drift from what the user sees.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PROTOCOL_VERSION, SERVER_NAME, TOOLS, err, toContent, type ToolResult } from './mcpProtocol'

/** How a tool call reaches the document. Injected so this file needs no
 * Electron import and stays unit-testable. */
export interface McpHost {
  /** Forward a tool call to the renderer holding the document. */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>
  /** Where to write the connection file. */
  userDataDir: string
  /** For the server's advertised version. */
  appVersion: string
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface RunningServer {
  port: number
  token: string
  close(): Promise<void>
}

/** Requests are small JSON documents; anything larger is not one of ours. */
const MAX_BODY = 1024 * 1024

export async function startMcpServer(host: McpHost): Promise<RunningServer> {
  const token = randomBytes(32).toString('hex')

  const server = createServer((req, res) => {
    void handle(req, res, host, token)
  })

  const port = await new Promise<number>((resolve, reject) => {
    server.on('error', reject)
    // 127.0.0.1 explicitly, never 0.0.0.0: binding the wildcard would expose
    // the user's design tool to their whole network.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') resolve(addr.port)
      else reject(new Error('no port'))
    })
  })

  await writeConnectionFile(host.userDataDir, port, token)

  return {
    port,
    token,
    close: async () => {
      // server.close() only STOPS ACCEPTING; it then waits for every open
      // connection to end. MCP clients hold a keep-alive socket open for the
      // whole session, so without closeAllConnections() this never resolves
      // and app quit hangs on a client that is simply idle.
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
      await removeConnectionFile(host.userDataDir).catch(() => undefined)
    }
  }
}

export function connectionFilePath(userDataDir: string): string {
  return path.join(userDataDir, 'studio', 'mcp.json')
}

async function writeConnectionFile(userDataDir: string, port: number, token: string): Promise<void> {
  const file = connectionFilePath(userDataDir)
  await fs.mkdir(path.dirname(file), { recursive: true })
  // 0600: the token is a credential, and userData is inside the user's profile
  // but not necessarily private to this process.
  await fs.writeFile(file, JSON.stringify({ port, token, pid: process.pid }, null, 2), { mode: 0o600 })
}

async function removeConnectionFile(userDataDir: string): Promise<void> {
  await fs.rm(connectionFilePath(userDataDir), { force: true })
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  host: McpHost,
  token: string
): Promise<void> {
  // No CORS headers at all. A browser page must never be able to reach this,
  // and adding Access-Control-Allow-Origin would be exactly how that happens.
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'POST only' }))
    return
  }
  const auth = req.headers.authorization ?? ''
  if (auth !== `Bearer ${token}`) {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'unauthorized' }))
    return
  }

  let body = ''
  let tooBig = false
  for await (const chunk of req) {
    body += chunk
    if (body.length > MAX_BODY) {
      tooBig = true
      break
    }
  }
  if (tooBig) {
    res.writeHead(413, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'body too large' }))
    return
  }

  let rpc: JsonRpcRequest
  try {
    rpc = JSON.parse(body) as JsonRpcRequest
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }))
    return
  }

  const reply = await dispatch(rpc, host)
  // A NOTIFICATION (no id) gets no response body — replying to one is a
  // protocol violation that some clients treat as a hard error.
  if (reply === null) {
    res.writeHead(202)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(reply))
}

/** Exported for tests: the whole protocol surface, with no HTTP around it. */
export async function dispatch(
  rpc: JsonRpcRequest,
  host: McpHost
): Promise<Record<string, unknown> | null> {
  const id = rpc.id ?? null
  const reply = (result: unknown): Record<string, unknown> => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, message: string): Record<string, unknown> => ({
    jsonrpc: '2.0',
    id,
    error: { code, message }
  })

  switch (rpc.method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: host.appVersion }
      })

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null

    case 'ping':
      return reply({})

    case 'tools/list':
      return reply({ tools: TOOLS })

    case 'tools/call': {
      const name = String(rpc.params?.name ?? '')
      const args = (rpc.params?.arguments as Record<string, unknown>) ?? {}
      if (!TOOLS.some((t) => t.name === name)) {
        return reply(toContent(err('NOT_FOUND', `unknown tool: ${name}`)))
      }
      try {
        return reply(toContent(await host.callTool(name, args)))
      } catch (e) {
        // A thrown error inside a tool must still come back as a RESULT with
        // isError, not as a JSON-RPC error: the model can read and act on the
        // former and can only give up on the latter.
        return reply(toContent(err('INTERNAL', e instanceof Error ? e.message : String(e))))
      }
    }

    default:
      return fail(-32601, `method not found: ${rpc.method}`)
  }
}
