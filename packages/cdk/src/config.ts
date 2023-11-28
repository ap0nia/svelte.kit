import fs from 'node:fs'
import path from 'node:path'
// import mod from 'node:module'

import type { Config } from '@sveltejs/kit'
// import createJITI from 'jiti'

export const SVELTE_CONFIG_FILE = 'svelte.config.js'

export async function loadSvelteKitConfig(): Promise<Config> {
  const sveltekitConfigFilePath = path.resolve(SVELTE_CONFIG_FILE)

  if (!fs.existsSync(sveltekitConfigFilePath)) {
    return {}
  }

  const config = await import(sveltekitConfigFilePath)

  return config.default || config

  // const jiti = createJITI(__filename)
  // const svelteConfig = mod.createRequire(import.meta.url)(SVELTE_CONFIG_FILE)
  // return svelteConfig
}

export type StaticFileInfo = {
  isDirectory: boolean
  path: string
}

/**
 * Any directories found in /static will be added as a CloudFront origin if it does not existing in /src/routes
 */
export function findStaticFiles(): StaticFileInfo[] {
  const currentDirectory = process.cwd()

  const staticDirectory = path.join(currentDirectory, 'static')

  if (!fs.existsSync(staticDirectory)) {
    return []
  }

  const routesDirectory = path.join(currentDirectory, 'src', 'routes')

  const staticFiles = fs
    .readdirSync(staticDirectory, { withFileTypes: true })
    .map((file) => {
      return {
        isDirectory: file.isDirectory(),
        path: path.relative(staticDirectory, path.join(file.path, file.name)),
      }
    })
    .filter((file) => {
      return !fs.existsSync(path.join(routesDirectory, file.path))
    })

  return staticFiles
}
