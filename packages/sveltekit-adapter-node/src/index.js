// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

import { build as esbuildBuild } from 'esbuild'

import { name } from '../package.json'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

/**
 * @see https://github.com/evanw/esbuild/issues/1921#issuecomment-1491470829
 */
const js = `\
import topLevelModule from 'node:module';
const require = topLevelModule.createRequire(import.meta.url);
`

/**
 * Custom namespace for resolving virtual files.
 */
const virtualNamespace = 'sveltekit-virtual'

/**
 * @type {import('.').default}
 */
function createAdapter(opts = {}) {
  const { out = 'build', precompress, envPrefix = '', polyfill = true } = opts

  const adapter = {
    name,

    /**
     * @param {import('@sveltejs/kit').Builder} builder
     */
    async adapt(builder) {
      /**
       * Temporary directory is created in the default SvelteKit outputs directory.
       *
       * @example '.svelte-kit/output/server/adapter-node'
       */
      const temporaryDirectory = path.join(builder.getServerDirectory(), 'adapter-node')

      /**
       * Components pre-rendered as HTML files.
       *
       * @example 'build/prerendered'
       */
      const prerenderedDirectory = path.join(out, 'prerendered', builder.config.kit.paths.base)

      /**
       * JS files referenced by the pre-rendered HTML files.
       *
       * @example 'build/client'
       */
      const clientDirectory = path.join(out, 'client', builder.config.kit.paths.base)

      /**
       * Some SvelteKit thing that determines internal routing.
       */
      const manifest = `${temporaryDirectory}/manifest.js`

      /**
       * The built SvelteKit server.
       */
      const server = `${temporaryDirectory}/index.js`

      builder.log.minor(`Cleaning ${out} and ${temporaryDirectory}`)

      builder.rimraf(out)
      builder.mkdirp(out)

      builder.rimraf(temporaryDirectory)
      builder.mkdirp(temporaryDirectory)

      builder.log.minor('Copying assets')

      builder.writeClient(clientDirectory)
      builder.writePrerendered(prerenderedDirectory)

      if (precompress) {
        builder.log.minor('Compressing assets')
        await Promise.all([
          builder.compress(clientDirectory),
          builder.compress(prerenderedDirectory),
        ])
      }

      builder.log.minor('Building server')

      builder.writeServer(temporaryDirectory)

      const manifestContents =
        `export const manifest = ${builder.generateManifest({ relativePath: './' })};\n\n` +
        `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});\n`

      // Dynamically create a manifest in the temporary directory.
      fs.writeFileSync(manifest, manifestContents)

      await esbuildBuild({
        entryPoints: {
          index: path.join(__dirname, 'build', 'index.ts'),
          handler: path.join(__dirname, 'build', 'handler.ts'),
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outdir: out,
        banner: { js },
        define: {
          'import.meta.SERVER_DIR': JSON.stringify(url.pathToFileURL(out)),
          'import.meta.ENV_PREFIX': JSON.stringify(envPrefix),
        },
        plugins: [
          {
            name: 'sveltekit-adapter-node-resolver',
            setup(build) {
              build.onResolve({ filter: /SERVER/ }, () => {
                return {
                  path: server,
                }
              })

              build.onResolve({ filter: /MANIFEST/ }, () => {
                return {
                  path: manifest,
                }
              })

              build.onResolve({ filter: /SHIMS/ }, (args) => {
                return {
                  path: args.path,
                  namespace: virtualNamespace,
                }
              })

              build.onLoad({ filter: /SHIMS/, namespace: virtualNamespace }, () => {
                return {
                  resolveDir: 'node_modules',
                  contents: polyfill
                    ? `import { installPolyfills } from '@sveltejs/kit/node/polyfills'; installPolyfills();`
                    : '',
                }
              })
            },
          },
        ],
      })
    },
  }

  return adapter
}

export default createAdapter
