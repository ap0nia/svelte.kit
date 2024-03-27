import type { SvelteKitOptions } from '@svelte.kit/cdk'
import type { Adapter } from '@sveltejs/kit'
import './ambient.js'

export interface AdapterOptions extends Omit<SvelteKitOptions, 'constructProps'> {
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
