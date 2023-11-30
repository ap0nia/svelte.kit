function handler(event) {
  const request = event.request
  request.headers['x-forwarded-host'] = request.headers.host
  for (const key in request.querystring) {
    if (key.includes('/')) {
      request.querystring[encodeURIComponent(key)] = request.querystring[key]
      delete request.querystring[key]
    }
  }
  return request
}

const module = {}
module.exports = { handler }

// // import { prerenderedMappings } from 'PRERENDERED'
// import type {
//   Callback,
//   CloudFrontHeaders,
//   CloudFrontRequestEvent,
//   CloudFrontRequestResult,
//   Context,
// } from 'aws-lambda'
//
// import { FORWARDED_HOST_HEADER } from '../http/headers.js'
// // import { methodsForPrerenderedFiles } from '../http/methods.js'
//
// function getHeaderValue(header: CloudFrontHeaders[string][number]) {
//   return { value: header.value }
// }
//
// /**
//  * Viewer Request Lambda@Edge handler to improve cache hit ratio.
//  */
// function handler(
//   event: CloudFrontRequestEvent,
//   _context: Context,
//   callback: Callback<CloudFrontRequestResult>,
// ): void {
//   var request = event.Records[0]?.cf.request
//
//   if (request == null) {
//     return undefined
//   }
//
//   var forwardedHostHeader = request.headers['host']?.map(getHeaderValue)
//
//   if (forwardedHostHeader) {
//     request.headers[FORWARDED_HOST_HEADER] = forwardedHostHeader
//   }
//
//   var query: Record<string, string> = {}
//
//   var keys = request.querystring.split('&')
//
//   for (var key of keys) {
//     if (key.includes('/')) {
//       query[encodeURIComponent(key)] = key
//     } else {
//       query[key] = key
//     }
//   }
//
//   /**
//    * Correctly encodes querystring parameters containing "/"
//    *
//    * @example '?/enter' => '?%2Fenter'
//    */
//   request.querystring = Object.values(query).join('&')
//
//   callback(null, request)
//
//   // if (!methodsForPrerenderedFiles.includes(request.method)) {
//   //   callback(null, request)
//   //   return undefined
//   // }
//
//   // var prerenderedFile = prerenderedMappings[request.uri]
//
//   // /**
//   //  * Lambda@Edge handler will re-write the URL to try to hit cache.
//   //  * For cache misses, it will hit the Lambda function, which will read from file system.
//   //  */
//   // if (!prerenderedFile) {
//   //   callback(null, request)
//   //   return undefined
//   // }
//
//   // request.uri = `/${prerenderedFile}`
//
//   // callback(null, request)
//
//   // return undefined
// }
//
// var module: any = {}
//
// module.exports = { handler }

// import { prerenderedMappings } from 'PRERENDERED'
// import type { CloudFrontRequestHandler } from 'aws-lambda'
//
// import { FORWARDED_HOST_HEADER } from '../http/headers.js'
// import { methodsForPrerenderedFiles } from '../http/methods.js'
//
// /**
//  * Viewer Request Lambda@Edge handler to improve cache hit ratio.
//  */
// export const handler: CloudFrontRequestHandler = (event, _context, callback) => {
//   const request = event.Records[0]?.cf.request
//
//   if (!request) {
//     return undefined
//   }
//
//   const forwardedHostHeader = request.headers['host']?.map(({ value }) => ({ value }))
//
//   if (forwardedHostHeader) {
//     request.headers[FORWARDED_HOST_HEADER] = forwardedHostHeader
//   }
//
//   /**
//    * Correctly encodes querystring parameters containing "/"
//    *
//    * @example '?/enter' => '?%2Fenter'
//    */
//   request.querystring = new URLSearchParams(request.querystring).toString()
//
//   if (!methodsForPrerenderedFiles.has(request.method)) {
//     callback(null, request)
//     return undefined
//   }
//
//   const prerenderedFile = prerenderedMappings.get(request.uri)
//
//   /**
//    * Lambda@Edge handler will re-write the URL to try to hit cache.
//    * For cache misses, it will hit the Lambda function, which will read from file system.
//    */
//   if (!prerenderedFile) {
//     callback(null, request)
//     return undefined
//   }
//
//   request.uri = `/${prerenderedFile}`
//
//   callback(null, request)
//
//   return undefined
// }
