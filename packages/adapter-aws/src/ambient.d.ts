declare module 'HANDLER' {
  export const handler: import('polka').Middleware
}

declare module 'MANIFEST' {
  import { SSRManifest } from '@sveltejs/kit'

  export const manifest: SSRManifest

  export const prerendered: Set<string>

  export const base: string

  export const prerenderedFileMappings: Map<string, string>

  /**
   * @see https://kit.svelte.dev/docs/configuration#appdir
   */
  export const appDir: string

  /**
   * @see https://kit.svelte.dev/docs/configuration#paths
   */
  export const basePath: string
}

declare module 'SERVER' {
  export { Server } from '@sveltejs/kit'
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
