import 'SHIMS'

import fs from 'node:fs'

import { manifest, prerenderedFileMappings } from 'MANIFEST'
import { Server } from 'SERVER'
import type {
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  Context,
  Callback,
} from 'aws-lambda'

import { FORWARDED_HOST_HEADER, PRERENDERED_FILE_HEADERS } from '../../http/headers'
import { methodsForPrerenderedFiles } from '../../http/methods'
import {
  convertApiGatewayProxyEventToInternalEvent,
  convertResponseToAPIGatewayProxyResult,
} from '../../utils/api-gateway'

const server = new Server(manifest)

const initialized = server.init({ env: process.env as Record<string, string> })

export async function handler(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  context: Context,
  callback: Callback,
): Promise<APIGatewayProxyResult | APIGatewayProxyResultV2> {
  await initialized

  const internalEvent = convertApiGatewayProxyEventToInternalEvent(event)

  const prerenderedFile = prerenderedFileMappings.get(internalEvent.path)

  if (prerenderedFile) {
    return {
      statusCode: 200,
      headers: PRERENDERED_FILE_HEADERS,
      body: fs.readFileSync(prerenderedFile, 'utf8'),
      isBase64Encoded: false,
    }
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
      callback,
    },
    getClientAddress: () => internalEvent.remoteAddress,
  })

  return convertResponseToAPIGatewayProxyResult(response, event)
}
