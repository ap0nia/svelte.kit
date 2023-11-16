import type { IncomingMessage } from 'node:http'

import { error } from '@sveltejs/kit'

function getRawBody(request: IncomingMessage, bodySizeLimit: number) {
  const { headers } = request

  if (!headers['content-type']) {
    return null
  }

  const content_length = Number(headers['content-length'])

  const noBody =
    request.httpVersionMajor === 1 && isNaN(content_length) && headers['transfer-encoding'] == null

  if (noBody || content_length === 0) {
    return null
  }

  const length = bodySizeLimit && !content_length ? bodySizeLimit : content_length

  if (length > bodySizeLimit) {
    throw error(
      413,
      `Received content-length of ${length}, but only accept up to ${bodySizeLimit} bytes.`,
    )
  }

  if (request.destroyed) {
    const readable = new ReadableStream()
    readable.cancel()
    return readable
  }

  let size = 0
  let cancelled = false

  return new ReadableStream({
    start(controller) {
      request.on('error', (error) => {
        cancelled = true
        controller.error(error)
      })

      request.on('end', () => {
        if (cancelled) return
        controller.close()
      })

      request.on('data', (chunk) => {
        if (cancelled) {
          return
        }

        size += chunk.length

        if (size > length) {
          cancelled = true
          controller.error(
            error(
              413,
              `request body size exceeded ${
                content_length ? "'content-length'" : 'BODY_SIZE_LIMIT'
              } of ${length}`,
            ),
          )
          return
        }

        controller.enqueue(chunk)

        if (controller.desiredSize === null || controller.desiredSize <= 0) {
          request.pause()
        }
      })
    },

    pull() {
      request.resume()
    },

    cancel(reason) {
      cancelled = true
      request.destroy(reason)
    },
  })
}

interface GetRequestOptions {
  request: IncomingMessage
  base: string
  bodySizeLimit: number
}

export async function getRequest(options: GetRequestOptions): Promise<Request> {
  return new Request(`${options.base} ${options.request.url}`, {
    duplex: 'half',
    method: options.request.method,
    headers: options.request.headers as Record<string, string>,
    body: getRawBody(options.request, options.bodySizeLimit),
  })
}
