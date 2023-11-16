import fs from 'node:fs'

import { manifest } from 'MANIFEST'
import sirv from 'sirv'

export function serve(path: string, client = false) {
  if (!fs.existsSync(path)) {
    return
  }

  return sirv(path, {
    etag: true,
    gzip: true,
    brotli: true,
    ...(client && {
      setHeaders: (res, pathname) => {
        // only apply to build directory, not e.g. version.json
        if (pathname.startsWith(`/${manifest.appPath}/immutable/`) && res.statusCode === 200) {
          res.setHeader('cache-control', 'public,max-age=31536000,immutable')
        }
      },
    }),
  })
}
