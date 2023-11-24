import fs from 'node:fs'
import mod from 'node:module'

import type { Config } from '@sveltejs/kit'
// import createJITI from 'jiti'

export const SVELTE_CONFIG_FILE = 'svelte.config.js'

export function loadSvelteKitConfig(): Config {
  if (!fs.existsSync(SVELTE_CONFIG_FILE)) {
    return {}
  }

  // const jiti = createJITI(__filename)
  const svelteConfig = mod.createRequire(import.meta.url)(SVELTE_CONFIG_FILE)
  return svelteConfig
}
