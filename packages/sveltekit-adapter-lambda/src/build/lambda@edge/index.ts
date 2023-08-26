import { prerenderedMappings } from 'PRERENDERED'
import type { CloudFrontRequestHandler } from 'aws-lambda'

import { FORWARDED_HOST_HEADER } from '../http/headers.js'
import { methodsForPrerenderedFiles } from '../http/methods.js'

/**
 * Viewer Request Lambda@Edge handler to improve cache hit ratio.
 */
export const handler: CloudFrontRequestHandler = async (event, _context, callback) => {
  const request = event.Records[0]?.cf.request

  if (!request) {
    return undefined
  }

  const forwardedHostHeader = request.headers['host']?.map(({ value }) => ({ value }))

  if (forwardedHostHeader) {
    request.headers[FORWARDED_HOST_HEADER] = forwardedHostHeader
  }

  /**
   * Correctly encodes querystring parameters containing "/"
   *
   * @example '?/enter' => '?%2Fenter'
   */
  request.querystring = new URLSearchParams(request.querystring).toString()

  if (!methodsForPrerenderedFiles.has(request.method)) {
    callback(null, request)
    return undefined
  }

  const prerenderedFile = prerenderedMappings.get(request.uri)

  /**
   * Lambda@Edge handler will re-write the URL to try to hit cache.
   * For cache misses, it will hit the Lambda function, which will read from file system.
   */
  if (!prerenderedFile) {
    callback(null, request)
    return undefined
  }

  request.uri = `/${prerenderedFile}`

  callback(null, request)
  return undefined
}
