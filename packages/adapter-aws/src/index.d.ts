import type { SvelteKitOptions } from '@svelte.kit/cdk'
import type { Adapter } from '@sveltejs/kit'
import type { BuildOptions } from 'esbuild'

import './ambient.js'

export interface AdapterOptions extends Omit<SvelteKitOptions, 'constructProps'> {
  /**
   * Build options for the AwS Lambda function.
   */
  esbuild?: BuildOptions | ((options: BuildOptions) => BuildOptions)

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
   * The directory that will be uploaded to the Lambda Function.
   *
   * User can modify the directory before uploading.
   */
  lambdaUpload?: (directory: string) => unknown
}

/**
 * Extended adapter forwards all the used options.
 */
export interface ExtendedAdapter extends Adapter, AdapterOptions {}

export default function plugin(options?: AdapterOptions): ExtendedAdapter
