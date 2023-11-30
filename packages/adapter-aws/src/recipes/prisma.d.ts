import type { AdapterOptions } from ".."

export interface PrismaUploadOptions {
  /**
   * The path to the Prisma query engine binary.
   *
   * @example
   * AWS Lambda x64 -> 'node_modules/prisma/libquery_engine-rhel-openssl-1.0.x.so.node'
   * AWS Lambda ARM64 -> 'node_modules/prisma/libquery_engine-linux-arm64-openssl-1.0.x.so.node'
   */
  engine: string

  /**
   * The path to the Prisma schema file.
   *
   * @example 'prisma/schema.prisma'
   */
  schema: string
}

export default function prisma(options: PrismaUploadOptions): Required<AdapterOptions>['lambdaUpload']
