import 'SHIMS'
import { readFileSync } from 'node:fs'

import { manifest } from 'MANIFEST'
import { prerenderedMappings } from 'PRERENDERED'
import { Server } from 'SERVER'
import type {
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  Context,
  Callback,
} from 'aws-lambda'

import { isBinaryContentType } from '../http/binary-content-types.js'
import { FORWARDED_HOST_HEADER, PRERENDERED_FILE_HEADERS } from '../http/headers.js'
import { methodsForPrerenderedFiles } from '../http/methods.js'

export interface InternalEvent {
  /**
   */
  readonly method: string

  /**
   */
  readonly path: string

  /**
   */
  readonly url: string

  /**
   */
  readonly body: Buffer

  /**
   */
  readonly headers: Record<string, string>

  /**
   */
  readonly remoteAddress: string
}

const server = new Server(manifest)

const initialized = server.init({ env: process.env as Record<string, string> })

/**
 * API Gateway / Lambda handler.
 */
export async function handler(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  context: Context,
  callback: Callback,
): Promise<APIGatewayProxyResult | APIGatewayProxyResultV2> {
  await initialized

  const internalEvent = isAPIGatewayProxyEventV2(event)
    ? convertAPIGatewayProxyEventV2ToRequest(event)
    : convertAPIGatewayProxyEventV1ToRequest(event)

  const prerenderedFile = prerenderedMappings.get(internalEvent.path)

  /**
   * Pre-rendered routes are handled by both Lambda and Lambda@Edge.
   * Lambda will serve the actual file contents; Lambda@Edge will re-write the URL to try to hit cache.
   */
  if (prerenderedFile) {
    return {
      statusCode: 200,
      headers: PRERENDERED_FILE_HEADERS,
      body: readFileSync(prerenderedFile, 'utf8'),
      isBase64Encoded: false,
    }
  }

  // Set correct host header
  if (internalEvent.headers[FORWARDED_HOST_HEADER]) {
    internalEvent.headers['host'] = internalEvent.headers[FORWARDED_HOST_HEADER]
  }

  const requestUrl = `https://${internalEvent.headers['host']}${internalEvent.url}`

  console.log(internalEvent)
  console.log(internalEvent.headers)
  console.log(internalEvent.url)
  console.log(event)
  console.log(event.headers)
  console.log(context, callback)

  const requestInit: RequestInit = {
    method: internalEvent.method,
    headers: internalEvent.headers,
    body: methodsForPrerenderedFiles.has(internalEvent.method) ? undefined : internalEvent.body,
  }

  const request = new Request(requestUrl, requestInit)

  const response = await server.respond(request, {
    platform: {
      event,
      context,
      callback,
    },
    getClientAddress: () => internalEvent.remoteAddress,
  })

  return isAPIGatewayProxyEventV2(event)
    ? convertResponseToAPIGatewayProxyResultV2(response)
    : convertResponseToAPIGatewayProxyResultV1(response)
}

function isAPIGatewayProxyEventV2(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
): event is APIGatewayProxyEventV2 {
  return 'version' in event && event.version === '2.0'
}

function convertAPIGatewayProxyEventV1ToRequest(event: APIGatewayProxyEvent): InternalEvent {
  const internalEvent = {
    method: event.httpMethod,
    path: event.path,
    remoteAddress: event.requestContext.identity.sourceIp,
  } as InternalEvent

  let url: string
  let body: Buffer
  let headers: Record<string, string>

  Object.defineProperties(internalEvent, {
    url: {
      enumerable: true,
      get: () => {
        url ??= event.path + normalizeAPIGatewayProxyEventQueryParams(event)
        return url
      },
    },
    body: {
      enumerable: true,
      get: () => {
        body ??= Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8')
        return body
      },
    },
    headers: {
      enumerable: true,
      get: () => {
        headers ??= normalizeAPIGatewayProxyEventHeaders(event)
        return headers
      },
    },
  })

  return internalEvent
}

function convertAPIGatewayProxyEventV2ToRequest(event: APIGatewayProxyEventV2): InternalEvent {
  const internalEvent = {
    method: event.requestContext.http.method,
    path: event.rawPath,
    remoteAddress: event.requestContext.http.sourceIp,
  } as InternalEvent

  let url: string
  let body: Buffer
  let headers: Record<string, string>

  Object.defineProperties(internalEvent, {
    url: {
      enumerable: true,
      get: () => {
        url ??= event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : '')
        return url
      },
    },
    body: {
      enumerable: true,
      get: () => {
        body ??= normalizeAPIGatewayProxyEventV2Body(event)
        return body
      },
    },
    headers: {
      enumerable: true,
      get: () => {
        headers ??= normalizeAPIGatewayProxyEventHeaders(event)
        return headers
      },
    },
  })

  return internalEvent
}

async function convertResponseToAPIGatewayProxyResultV1(
  response: Response,
): Promise<APIGatewayProxyResult> {
  const isBase64Encoded = isBinaryContentType(response.headers.get('content-type'))

  const result: APIGatewayProxyResult = {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    multiValueHeaders: {},
    body: isBase64Encoded
      ? Buffer.from(await response.arrayBuffer()).toString('base64')
      : await response.text(),
    isBase64Encoded,
  }

  return result
}

async function convertResponseToAPIGatewayProxyResultV2(
  response: Response,
): Promise<APIGatewayProxyResultV2> {
  const isBase64Encoded = isBinaryContentType(response.headers.get('content-type'))

  const result: APIGatewayProxyResultV2 = {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    cookies: response.headers.get('set-cookie')?.split(', ') ?? [],
    body: isBase64Encoded
      ? Buffer.from(await response.arrayBuffer()).toString('base64')
      : await response.text(),
    isBase64Encoded,
  }

  return result
}

function normalizeAPIGatewayProxyEventV2Body(event: APIGatewayProxyEventV2): Buffer {
  if (Buffer.isBuffer(event.body)) {
    return event.body
  } else if (typeof event.body === 'string') {
    return Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
  } else if (typeof event.body === 'object') {
    return Buffer.from(JSON.stringify(event.body))
  }
  return Buffer.from('', 'utf8')
}

function normalizeAPIGatewayProxyEventQueryParams(event: APIGatewayProxyEvent): string {
  const params = new URLSearchParams()

  if (event.multiValueQueryStringParameters) {
    for (const [key, value] of Object.entries(event.multiValueQueryStringParameters)) {
      if (value !== undefined) {
        for (const v of value) {
          params.append(key, v)
        }
      }
    }
  }

  if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) {
        params.append(key, value)
      }
    }
  }

  const value = params.toString()

  return value ? `?${value}` : ''
}

function normalizeAPIGatewayProxyEventHeaders(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
): Record<string, string> {
  const headers: Record<string, string> = {}

  if ('multiValueHeaders' in event && event.multiValueHeaders) {
    for (const [key, values] of Object.entries(event.multiValueHeaders)) {
      if (values) {
        headers[key.toLowerCase()] = values.join(',')
      }
    }
  }

  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value) {
        headers[key.toLowerCase()] = value
      }
    }
  }

  if ('cookies' in event && event.cookies) {
    headers['cookie'] = event.cookies.join('; ')
  }

  return headers
}
