declare module 'HANDLER' {
  export const handler: import('polka').Middleware
}

declare module 'MANIFEST' {
  import { SSRManifest } from '@sveltejs/kit'

  export const manifest: SSRManifest

  export const prerendered: Set<string>

  export const base: string
}

declare module 'SERVER' {
  export { Server } from '@sveltejs/kit'
}

interface ImportMeta {
  SERVER_DIR: string
  ENV_PREFIX?: string
}

declare namespace App {
  export interface Platform {
    /**
     */
    event: import('aws-lambda').APIGatewayProxyEvent | import('aws-lambda').APIGatewayProxyEventV2

    /**
     */
    context: import('aws-lambda').Context

    /**
     */
    callback: import('aws-lambda').Callback
  }
}
