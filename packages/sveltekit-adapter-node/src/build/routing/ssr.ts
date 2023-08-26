import type { IncomingHttpHeaders } from 'node:http'

import type { Server } from '@sveltejs/kit'
import type { Middleware } from 'polka'

import { ENV_PREFIX } from '../env.js'
import { getRequest } from '../http/request.js'
import { setResponse } from '../http/response.js'

type MiddlewareRequest = Parameters<Middleware>[0]

export function createSsr(
  server: Server,
  origin: string,
  xffDepth: number,
  addressHeader: string,
  protocolHeader: string,
  hostHeader: string,
  bodySizeLimit: number,
): Middleware {
  const getOrigin = (headers: IncomingHttpHeaders): string => {
    const protocol = (protocolHeader && headers[protocolHeader]) || 'https'
    const host = headers[hostHeader]
    return `${protocol}://${host}`
  }

  const ssr: Middleware = async (req, res) => {
    const request = await getRequest({
      base: origin || getOrigin(req.headers),
      request: req,
      bodySizeLimit: bodySizeLimit,
    }).catch((err) => {
      res.statusCode = err.status ?? 400
    })

    if (!request) {
      res.end('Invalid request body')
      return
    }

    const response = await server.respond(request, {
      platform: { req },
      getClientAddress: () => getClientAddress(req, addressHeader, xffDepth),
    })

    setResponse(res, response)
  }

  return ssr
}

function getClientAddress(req: MiddlewareRequest, addressHeader: string, xffDepth: number) {
  if (!(addressHeader in req.headers)) {
    throw new Error(
      `Address header was specified with ${
        ENV_PREFIX + 'ADDRESS_HEADER'
      }=${addressHeader} but is absent from request`,
    )
  }

  if (!addressHeader) {
    return (
      req.connection?.remoteAddress ??
      req.connection?.socket?.remoteAddress ??
      req.socket?.remoteAddress ??
      req.info?.remoteAddress ??
      ''
    )
  }

  const value = (req.headers[addressHeader] ?? '') as string

  if (addressHeader === 'x-forwarded-for') {
    const addresses = value.split(',')

    if (xffDepth < 1) {
      throw new Error(`${ENV_PREFIX + 'XFF_DEPTH'} must be a positive integer`)
    }

    if (xffDepth > addresses.length) {
      throw new Error(
        `${ENV_PREFIX + 'XFF_DEPTH'} is ${xffDepth}, but only found ${addresses.length} addresses`,
      )
    }

    return addresses[addresses.length - xffDepth]?.trim() ?? ''
  }

  return value
}
