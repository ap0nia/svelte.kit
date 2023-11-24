import { Adapter } from '@sveltejs/kit'
import './ambient.js'

export interface AdapterOptions {
  /**
   * The directory to write the build outputs to.
   *
   * @default 'build'
   */
  out?: string

  /**
   * Whether to precompress the static assets.
   *
   * @default false
   */
  precompress?: boolean

  /**
   * Prefix of environment variables.
   *
   * @default ''
   */
  envPrefix?: string

  /**
   * Whether to include polyfills.
   *
   * @default true
   */
  polyfill?: boolean

  /**
   * Subdirectory in the build directory to serve static assets from S3 to CloudFront.
   *
   * @default 's3'
   */
  s3Directory?: string

  /**
   * Subdirectory in the build directory to serve lambda files.
   *
   * @default 'lambda'
   */
  lambdaDirectory?: string

  /**
   * Subdirectory in the build directory to serve CloudFront (function) files.
   *
   * @default 'lambda@edge'
   */
  lambdaAtEdgeDirectory?: string
}

/**
 * Extended adapter forwards all the used options.
 */
export interface ExtendedAdapter extends Adapter, AdapterOptions {}

export default function plugin(options?: AdapterOptions): ExtendedAdapter
