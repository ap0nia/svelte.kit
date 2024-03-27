import 'SHIMS'

import fs from 'node:fs'

import { manifest, prerenderedFileMappings } from 'MANIFEST'
import { Server } from 'SERVER'

import { FORWARDED_HOST_HEADER, PRERENDERED_FILE_HEADERS } from '../../http/headers'
import { methodsForPrerenderedFiles } from '../../http/methods'
import type { AwsLambda } from '../../internal/aws-lambda'
import { convertApiGatewayProxyEventToInternalEvent } from '../../utils/api-gateway'

declare const awslambda: AwsLambda

const server = new Server(manifest)

const initialized = server.init({ env: process.env as Record<string, string> })

/**
 * API Gateway / Lambda handler.
 */
export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  await initialized

  const internalEvent = convertApiGatewayProxyEventToInternalEvent(event)

  const prerenderedFile = prerenderedFileMappings.get(internalEvent.path)

  /**
   * Pre-rendered routes are handled by both Lambda and Lambda@Edge.
   * Lambda will serve the actual file contents; Lambda@Edge will re-write the URL to try to hit cache.
   */
  if (prerenderedFile != null) {
    const httpResponseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: PRERENDERED_FILE_HEADERS,
    })

    const readStream = fs.createReadStream(prerenderedFile)

    readStream.on('data', (chunk) => httpResponseStream.write(chunk))
    readStream.on('end', () => httpResponseStream.end())

    return
  }

  const forwardedHostHeader = internalEvent.headers[FORWARDED_HOST_HEADER]

  if (forwardedHostHeader != null) {
    internalEvent.headers['host'] = forwardedHostHeader
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

  if (!response.body) {
    responseStream.end()
    return
  }

  const responseHeadersEntries = [] as [string, string][]

  response.headers.forEach((value, key) => {
    responseHeadersEntries.push([key, value])
  })

  const httpResponseStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: response.status,
    headers: Object.fromEntries(responseHeadersEntries),
  })

  const reader = response.body.getReader()

  const readNext = (chunk: ReadableStreamReadResult<Uint8Array>): Promise<void> | void => {
    if (chunk.done) {
      httpResponseStream.end()
      return
    }

    httpResponseStream.write(chunk.value)

    return reader.read().then(readNext)
  }

  reader.read().then(readNext)
})
