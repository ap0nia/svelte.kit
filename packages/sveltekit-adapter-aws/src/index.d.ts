import { Adapter } from '@sveltejs/kit'
import './ambient.js'

export interface AdapterOptions {
  /**
   */
  out?: string

  /**
   */
  precompress?: boolean

  /**
   */
  envPrefix?: string

  /**
   * Whether to include polyfills.
   */
  polyfill?: boolean

  /**
   * Subdirectory in the build directory to serve static assets from S3 to CloudFront.
   */
  s3Directory?: string

  /**
   * Subdirectory in the build directory to serve lambda files.
   */
  lambdaDirectory?: string

  /**
   * Subdirectory in the build directory to serve CloudFront (function) files.
   */
  lambdaAtEdgeDirectory?: string
}

/**
 * Extended adapter forwards all the used options.
 */
export interface ExtendedAdapter extends Adapter, AdapterOptions {}

export default function plugin(options?: AdapterOptions): ExtendedAdapter
