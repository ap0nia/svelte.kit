/**
 * The Host header forwarded from CloudFront to Lambda.
 */
export const FORWARDED_HOST_HEADER = 'x-forwarded-host'

export const PRERENDERED_FILE_HEADERS = {
  'content-type': 'text/html',
  'cache-control': 'public, max-age=0, s-maxage=31536000, must-revalidate',
}
