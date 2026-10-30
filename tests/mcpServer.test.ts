import { describe, expect, it } from 'vitest'
import { connectionFilePath, dispatch, type McpHost } from '../electron/studio/mcpServer'
import { PROTOCOL_VERSION, SERVER_NAME, TOOLS, err, ok } from '../electron/studio/mcpProtocol'

const host = (over: Partial<McpHost> = {}): McpHost => ({
  callTool: async () => ok({ hello: true }),
  userDataDir: 'C:\\Users\\x\\AppData\\Roaming\\EXELMJ',
  appVersion: '0.2.2',
  ...over
})

const rpc = (method: string, params?: Record<string, unknown>, id: string | number | null = 1) => ({
  jsonrpc: '2.0' as const,
  id,
  method,
  ...(params ? { params } : {})
})

describe('initialize', () => {
  it('answers with the protocol version and server identity', async () => {
    const r = (await dispatch(rpc('initialize'), host()))!
    const result = r.result as Record<string, unknown>
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION)
    expect((result.serverInfo as Record<string, string>).name).toBe(SERVER_NAME)
    expect((result.serverInfo as Record<string, string>).version).toBe('0.2.2')
  })

  it('declares the tools capability', async () => {
    const r = (await dispatch(rpc('initialize'), host()))!
    expect((r.result as Record<string, unknown>).capabilities).toHaveProperty('tools')
  })

  it('echoes the request id', async () => {
    expect((await dispatch(rpc('initialize', undefined, 'abc'), host()))!.id).toBe('abc')
  })
})

describe('notifications get NO response', () => {
  it('stays silent for initialized', async () => {
    expect(await dispatch(rpc('notifications/initialized', undefined, null), host())).toBe(null)
  })

  it('stays silent for cancelled', async () => {
    expect(await dispatch(rpc('notifications/cancelled', undefined, null), host())).toBe(null)
  })
})

describe('tools/list', () => {
  it('returns every tool', async () => {
    const r = (await dispatch(rpc('tools/list'), host()))!
    const tools = (r.result as { tools: unknown[] }).tools
    expect(tools).toHaveLength(TOOLS.length)
  })

  it('every entry carries a name, description and schema', async () => {
    const r = (await dispatch(rpc('tools/list'), host()))!
    for (const t of (r.result as { tools: Array<Record<string, unknown>> }).tools) {
      expect(typeof t.name).toBe('string')
      expect(typeof t.description).toBe('string')
      expect((t.inputSchema as Record<string, unknown>).type).toBe('object')
    }
  })
})

describe('tools/call', () => {
  it('forwards the call and wraps the result as content', async () => {
    let seen: { name: string; args: Record<string, unknown> } | null = null
    const r = (await dispatch(
      rpc('tools/call', { name: 'studio_status', arguments: { a: 1 } }),
      host({
        callTool: async (name, args) => {
          seen = { name, args }
          return ok({ running: true })
        }
      })
    ))!
    expect(seen!.name).toBe('studio_status')
    expect(seen!.args).toEqual({ a: 1 })
    const content = (r.result as { content: Array<{ text: string }> }).content
    expect(JSON.parse(content[0].text).running).toBe(true)
  })

  it('reports an unknown tool as a RESULT the model can read, not a transport error', async () => {
    const r = (await dispatch(rpc('tools/call', { name: 'nope', arguments: {} }), host()))!
    expect(r.error).toBe(undefined)
    const result = r.result as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('NOT_FOUND')
  })

  it('turns a THROWN tool error into a readable result rather than a JSON-RPC error', async () => {
    const r = (await dispatch(
      rpc('tools/call', { name: 'studio_status', arguments: {} }),
      host({
        callTool: async () => {
          throw new Error('document is closed')
        }
      })
    ))!
    expect(r.error).toBe(undefined)
    const result = r.result as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('document is closed')
  })

  it('passes a tool failure value through with its code', async () => {
    const r = (await dispatch(
      rpc('tools/call', { name: 'studio_status', arguments: {} }),
      host({ callTool: async () => err('NO_DOCUMENT', 'nothing open') })
    ))!
    const result = r.result as { isError: boolean; content: Array<{ text: string }> }
    expect(result.content[0].text).toContain('NO_DOCUMENT')
    expect(result.content[0].text).toContain('nothing open')
  })

  it('defaults missing arguments to an empty object', async () => {
    let seen: Record<string, unknown> | null = null
    await dispatch(
      rpc('tools/call', { name: 'studio_status' }),
      host({
        callTool: async (_n, args) => {
          seen = args
          return ok({})
        }
      })
    )
    expect(seen).toEqual({})
  })
})

describe('unknown methods', () => {
  it('answers with method-not-found rather than silence', async () => {
    const r = (await dispatch(rpc('does/not/exist'), host()))!
    expect((r.error as { code: number }).code).toBe(-32601)
  })

  it('answers ping', async () => {
    expect((await dispatch(rpc('ping'), host()))!.result).toEqual({})
  })
})

describe('the connection file', () => {
  it('lives under the app data dir in a studio folder', () => {
    const p = connectionFilePath('C:\\data')
    expect(p).toContain('studio')
    expect(p.endsWith('mcp.json')).toBe(true)
  })
})
