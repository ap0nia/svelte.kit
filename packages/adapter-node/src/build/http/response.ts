import type { ServerResponse } from 'node:http'

import { splitCookiesString } from 'set-cookie-parser'

function noop() {
  /* eslint-ignore */
}

export async function setResponse(res: ServerResponse, response: Response): Promise<void> {
  for (const [key, value] of response.headers) {
    try {
      res.setHeader(key, key === 'set-cookie' ? splitCookiesString(value) : value)
    } catch (error) {
      res.getHeaderNames().forEach((name) => res.removeHeader(name))
      res.writeHead(500).end(String(error))
      return
    }
  }

  res.writeHead(response.status)

  if (!response.body) {
    res.end()
    return
  }

  if (response.body.locked) {
    res.end(
      'Fatal error: Response body is locked. ' +
        "This can happen when the response was already read (for example through 'response.json()' or 'response.text()').",
    )
    return
  }

  const reader = response.body.getReader()

  if (res.destroyed) {
    reader.cancel()
    return
  }

  const cancel = (error?: Error) => {
    res.off('close', cancel)
    res.off('error', cancel)

    // If the reader has already been interrupted with an error earlier,
    // then it will appear here, it is useless, but it needs to be catch.
    reader.cancel(error).catch(noop)

    if (error) {
      res.destroy(error)
    }
  }

  res.on('close', cancel)
  res.on('error', cancel)

  async function next() {
    try {
      for (;;) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (!res.write(value)) {
          res.once('drain', next)
          return
        }
      }
      res.end()
    } catch (error) {
      cancel(error instanceof Error ? error : new Error(String(error)))
    }
  }

  next()
}
