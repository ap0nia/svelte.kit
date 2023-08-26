declare module 'HANDLER' {
  export const handler: import('polka').Middleware
}

declare module 'MANIFEST' {
  import { SSRManifest } from '@sveltejs/kit'

  export const manifest: SSRManifest

  export const prerendered: Set<string>
}

declare module 'SERVER' {
  export { Server } from '@sveltejs/kit'
}

declare module 'PRERENDERED' {
  /**
   * Maps all possible route variants to the corresponding file.
   * @example
   * "" -> "index.html"
   * "/" -> "index.html"
   * "sverdle/how-to-play" -> "sverdle/how-to-play.html"
   * "/sverdle/how-to-play" -> "sverdle/how-to-play.html"
   * "/sverdle/how-to-play/" -> "sverdle/how-to-play.html"
   */
  export const prerenderedMappings: Map<string, string>
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

declare module 'net' {
  interface Socket {
    socket: Omit<Socket, 'socket'>
  }
}

declare module 'http' {
  interface IncomingMessage {
    info: import('node:net').Socket
  }
}

interface RequestInit {
  duplex?: string
}
