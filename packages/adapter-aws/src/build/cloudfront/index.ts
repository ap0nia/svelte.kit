import type { CloudFrontFunctionsEvent } from 'aws-lambda'

import { FORWARDED_HOST_HEADER } from '../../http/headers'

declare let DOMAIN_NAME: string | undefined

export default (
  event: CloudFrontFunctionsEvent,
): CloudFrontFunctionsEvent['request'] | CloudFrontFunctionsEvent['response'] => {
  const request = event.request

  const hostHeader = request.headers['host']

  if (hostHeader == null) {
    return {
      headers: {},
      cookies: {},
      statusCode: 400,
    }
  }

  const keys = Object.keys(request.querystring)
  const values = Object.values(request.querystring)

  if (hostHeader.value === DOMAIN_NAME || !DOMAIN_NAME) {
    request.querystring = {}

    request.headers[FORWARDED_HOST_HEADER] = {
      value: hostHeader.value,
    }

    keys.forEach((key, index) => {
      const value = values[index]
      if (value != null) {
        request.querystring[encodeURIComponent(key)] = value
      }
    })

    return request
  }

  let search = '?'

  keys.forEach((key) => {
    const entry = request.querystring[key]
    const value = entry?.value

    if (search !== '?') {
      search = search + '&'
    }

    search = search + key + '=' + value

    if (entry?.multiValue != null) {
      entry.multiValue.forEach((value) => {
        search = search + '&' + key + '=' + value
      })
    }
  })

  return {
    statusCode: 308,
    cookies: {},
    headers: {
      location: {
        value: 'https://' + DOMAIN_NAME + request.uri + search,
      },
    },
  }
}
