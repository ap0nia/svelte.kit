/* eslint-disable no-var */

/**
 * This file needs to be compatible with ES5 for CloudFront functions, so use `var`.
 */

/**
 * The Host header forwarded from CloudFront to Lambda.
 */
export var FORWARDED_HOST_HEADER = 'x-forwarded-host'

export var PRERENDERED_FILE_HEADERS = {
  'content-type': 'text/html',
  'cache-control': 'public, max-age=0, s-maxage=31536000, must-revalidate',
}
