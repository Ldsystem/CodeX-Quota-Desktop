/**
 * The one place that talks to the network.
 *
 * Proxy handling matches the CLI's `CQ_HTTP_PROXY`, which defaults to a local
 * proxy: on a machine without one running, every call fails fast and the
 * caller degrades to "quota unavailable" rather than hanging.
 */

import { ProxyAgent, request, type Dispatcher } from 'undici'

export interface JsonResponse {
  status: number
  body: unknown
}

export interface JsonRequest {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  json?: unknown
  proxyUrl?: string | null
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

const agents = new Map<string, ProxyAgent>()

function dispatcherFor(proxyUrl: string | null | undefined): Dispatcher | undefined {
  if (!proxyUrl) return undefined

  let agent = agents.get(proxyUrl)
  if (!agent) {
    agent = new ProxyAgent(proxyUrl)
    agents.set(proxyUrl, agent)
  }
  return agent
}

export async function requestJson(url: string, options: JsonRequest = {}): Promise<JsonResponse> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const response = await request(url, {
    method: options.method ?? 'GET',
    dispatcher: dispatcherFor(options.proxyUrl),
    headers: {
      ...(options.json === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers
    },
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    headersTimeout: timeout,
    bodyTimeout: timeout
  })

  const text = await response.body.text()
  let body: unknown = null
  try {
    body = text.length > 0 ? JSON.parse(text) : null
  } catch {
    body = null
  }

  return { status: response.statusCode, body }
}
