import http from 'node:http'
import { URL } from 'node:url'
import type { ApiRequest, ApiResponse, ApiServer } from './server.js'

function applyCors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/**
 * 将 {@link ApiServer} 挂到 Node 原生 HTTP，供 `cline serve` 与 UI 代理使用。
 */
export function createHttpServerForApi(api: ApiServer): http.Server {
  return http.createServer(async (req, res) => {
    applyCors(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const host = req.headers.host ?? 'localhost'
    const u = new URL(req.url ?? '/', `http://${host}`)
    const query: Record<string, string> = {}
    u.searchParams.forEach((v, k) => {
      query[k] = v
    })

    let body: unknown
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      const ct = req.headers['content-type'] ?? ''
      if (ct.includes('application/json')) {
        body = await readJsonBody(req)
      }
    }

    const apiReq: ApiRequest = {
      method: req.method ?? 'GET',
      path: u.pathname,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : (v ?? '')])
      ),
      query,
      body,
    }

    let out: ApiResponse
    try {
      out = await api.handleRequest(apiReq)
    } catch {
      out = { status: 500, headers: { 'Content-Type': 'application/json' }, body: { error: 'Internal Server Error' } }
    }

    const headers: Record<string, string> = { ...(out.headers ?? {}) }
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json; charset=utf-8'
    }
    applyCors(res)
    res.writeHead(out.status, headers)
    if (out.body === undefined || out.body === null) {
      res.end()
    } else if (typeof out.body === 'string') {
      res.end(out.body)
    } else {
      res.end(JSON.stringify(out.body))
    }
  })
}

export function listenApiServer(
  api: ApiServer,
  port: number,
  host: string
): Promise<http.Server> {
  const httpServer = createHttpServerForApi(api)
  return new Promise((resolve, reject) => {
    httpServer.listen(port, host, () => resolve(httpServer))
    httpServer.on('error', reject)
  })
}
