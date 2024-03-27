import type {
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
} from 'aws-lambda'

import { isBinaryContentType } from '../http/binary-content-types'
import type { InternalEvent } from '../internal/event'

export function convertApiGatewayProxyEventToInternalEvent(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
): InternalEvent {
  return isAPIGatewayProxyEventV2(event)
    ? convertAPIGatewayProxyEventV2ToRequest(event)
    : convertAPIGatewayProxyEventV1ToRequest(event)
}

export function convertResponseToAPIGatewayProxyResult(
  response: Response,
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResult | APIGatewayProxyResultV2> {
  return isAPIGatewayProxyEventV2(event)
    ? convertResponseToAPIGatewayProxyResultV2(response)
    : convertResponseToAPIGatewayProxyResultV1(response)
}

export function isAPIGatewayProxyEventV2(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
): event is APIGatewayProxyEventV2 {
  return 'version' in event && event.version === '2.0'
}

export function convertAPIGatewayProxyEventV1ToRequest(event: APIGatewayProxyEvent): InternalEvent {
  return {
    method: event.httpMethod,
    path: event.path,
    remoteAddress: event.requestContext.identity.sourceIp,
    url: event.path + normalizeAPIGatewayProxyEventQueryParams(event),
    body: Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8'),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
  }
}

export function convertAPIGatewayProxyEventV2ToRequest(
  event: APIGatewayProxyEventV2,
): InternalEvent {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    remoteAddress: event.requestContext.http.sourceIp,
    url: event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : ''),
    body: normalizeAPIGatewayProxyEventV2Body(event),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
  }
}

export async function convertResponseToAPIGatewayProxyResultV1(
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

export async function convertResponseToAPIGatewayProxyResultV2(
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

export function normalizeAPIGatewayProxyEventV2Body(event: APIGatewayProxyEventV2): Buffer {
  if (Buffer.isBuffer(event.body)) {
    return event.body
  }

  if (typeof event.body === 'string') {
    return Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
  }

  if (typeof event.body === 'object') {
    return Buffer.from(JSON.stringify(event.body))
  }

  return Buffer.from('', 'utf8')
}

export function normalizeAPIGatewayProxyEventQueryParams(event: APIGatewayProxyEvent): string {
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

export function normalizeAPIGatewayProxyEventHeaders(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
): Record<string, string> {
  const headers: Record<string, string> = {}

  if ('multiValueHeaders' in event && event.multiValueHeaders != null) {
    for (const [key, values] of Object.entries(event.multiValueHeaders)) {
      if (values) {
        headers[key.toLowerCase()] = values.join(',')
      }
    }
  }

  if (event.headers != null) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value) {
        headers[key.toLowerCase()] = value
      }
    }
  }

  if ('cookies' in event && event.cookies != null) {
    headers['cookie'] = event.cookies.join('; ')
  }

  return headers
}
