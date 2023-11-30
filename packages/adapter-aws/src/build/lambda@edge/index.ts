import type { CloudFrontFunctionsEvent } from 'aws-lambda'
import { FORWARDED_HOST_HEADER } from '../../http/headers'

function handler(event: CloudFrontFunctionsEvent) {
  var request = event.request

  var hostHeader = request.headers['host']

  if (hostHeader) {
    request.headers[FORWARDED_HOST_HEADER] = hostHeader
  }

  for (var key in request.querystring) {
    var value = request.querystring[key]

    if (key.includes('/') && value) {
      request.querystring[encodeURIComponent(key)] = value
      delete request.querystring[key]
    }
  }

  return request
}

const module: any = {}
module.exports = { handler }
