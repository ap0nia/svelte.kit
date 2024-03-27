import 'SHIMS'

import fs from 'node:fs'
import type { Writable } from 'node:stream'

import { manifest, prerenderedFileMappings } from 'MANIFEST'
import { Server } from 'SERVER'
import type { APIGatewayProxyEvent, APIGatewayProxyEventV2, Context } from 'aws-lambda'

import { FORWARDED_HOST_HEADER, PRERENDERED_FILE_HEADERS } from '../../http/headers'
import { methodsForPrerenderedFiles } from '../../http/methods'

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

await server.init({ env: process.env as Record<string, string> })

export type AwsLambda = {
  /**
   * Creates a response stream from a handler function.
   * @example
   * ```js
   * export const handler = awslambda.streamifyResponse(
   *   async (event, responseStream) => {
   *    responseStream.write("Streaming with Helper \n");
   *    responseStream.write("Hello 0 \n");
   *    responseStream.write("Hello 1 \n");
   *    responseStream.write("Hello 2 \n");
   *    responseStream.end();
   *    await responseStream.finished();
   *  }
   *);
   * ```
   * @see https://docs.aws.amazon.com/lambda/latest/dg/response-streaming-tutorial.html#response-streaming-tutorial-create-function-cfn
   */
  streamifyResponse: (
    handler: (
      event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
      responseStream: Writable,
      context: Context,
    ) => Promise<void> | void,
  ) => void
  /**
   * Sets the http status code and headers of the response.
   * ```js
   * async (event, responseStream) => {
   *  const metadata = {
   *    statusCode: 200,
   *    headers: {
   *      "Content-Type": "application/json",
   *      "CustomHeader": "outerspace"
   *    }
   *  };
   *
   *  // Assign to the responseStream parameter to prevent accidental reuse of the non-wrapped stream.
   *  responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
   *
   *  responseStream.write("Streaming with Helper \n");
   *
   *  // ...
   *}
   * ```
   * @see https://docs.aws.amazon.com/lambda/latest/dg/response-streaming-tutorial.html#response-streaming-tutorial-create-function-cfn
   */
  HttpResponseStream: {
    from: (responseStream: Writable, metadata: ResponseStreamMetadata) => Writable
  }
}

export declare const awslambda: AwsLambda

export type ResponseStreamMetadata = {
  /**
   * HTTP status code
   * @example 200
   */
  statusCode: number
  /**
   * HTTP headers
   * @example
   * ```js
   * {
   *   "Content-Type": "application/json",
   *   "CustomHeader": "outerspace"
   * }
   * ```
   */
  headers: Record<string, string>
}

/**
 * API Gateway / Lambda handler.
 */
export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  const internalEvent = isAPIGatewayProxyEventV2(event)
    ? convertAPIGatewayProxyEventV2ToRequest(event)
    : convertAPIGatewayProxyEventV1ToRequest(event)

  const prerenderedFile = prerenderedFileMappings.get(internalEvent.path)

  /**
   * Pre-rendered routes are handled by both Lambda and Lambda@Edge.
   * Lambda will serve the actual file contents; Lambda@Edge will re-write the URL to try to hit cache.
   */
  if (prerenderedFile) {
    responseStream = qualified(responseStream, {
      awslambda,
      statusCode: 200,
      headers: PRERENDERED_FILE_HEADERS,
    })

    const src = fs.createReadStream(prerenderedFile)
    src.on('data', (chunk) => responseStream.write(chunk))
    src.on('end', () => responseStream.end())
    return
  }

  if (internalEvent.headers[FORWARDED_HOST_HEADER]) {
    internalEvent.headers['host'] = internalEvent.headers[FORWARDED_HOST_HEADER]
  }

  const requestUrl = `https://${internalEvent.headers['host']}${internalEvent.url}`

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
      callback: responseStream as any,
    },
    getClientAddress: () => internalEvent.remoteAddress,
  })

  return runStream({
    response,
    responseStream,
    awslambda,
  })
})

export const runStream = ({
  response,
  responseStream,
  awslambda,
}: {
  response: Response
  responseStream: Writable
  awslambda: AwsLambda
}) => {
  const responseHeadersEntries = [] as [string, string][]

  response.headers.forEach((value, key) => {
    responseHeadersEntries.push([key, value])
  })

  responseStream = qualified(responseStream, {
    statusCode: response.status,
    headers: Object.fromEntries(responseHeadersEntries),
    awslambda,
  })

  if (!response.body) {
    responseStream.end()
    return
  }

  const reader = response.body.getReader()

  const readNext = (chunk: ReadableStreamReadResult<Uint8Array>): Promise<void> | void => {
    if (chunk.done) {
      responseStream.end()
      return
    }

    responseStream.write(chunk.value)

    return reader.read().then(readNext)
  }

  reader.read().then(readNext)
}

export const qualified = (
  responseStream: Writable,
  {
    awslambda,
    statusCode,
    headers,
  }: {
    statusCode: number
    headers: Record<string, string>
    awslambda: AwsLambda
  },
) =>
  awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers,
  })

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
    url: event.path + normalizeAPIGatewayProxyEventQueryParams(event),
    body: Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8'),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
  }

  return internalEvent
}

function convertAPIGatewayProxyEventV2ToRequest(event: APIGatewayProxyEventV2): InternalEvent {
  const internalEvent: InternalEvent = {
    method: event.requestContext.http.method,
    path: event.rawPath,
    remoteAddress: event.requestContext.http.sourceIp,
    url: event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : ''),
    body: normalizeAPIGatewayProxyEventV2Body(event),
    headers: normalizeAPIGatewayProxyEventHeaders(event),
  }

  return internalEvent
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
