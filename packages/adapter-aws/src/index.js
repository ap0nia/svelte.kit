// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

import esbuild from 'esbuild'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

/**
 * Custom banner to support `dynamic require of ...`
 * @see https://github.com/evanw/esbuild/issues/1921#issuecomment-1491470829
 */
const js = `\
import topLevelModule from "node:module";
import topLevelUrl from "node:url";
import topLevelPath from "node:path";

const require = topLevelModule.createRequire(import.meta.url);
const __filename = topLevelUrl.fileURLToPath(import.meta.url);
const __dirname = topLevelPath.dirname(__filename);
`

/**
 * Custom namespace for resolving virtual files.
 */
const namespace = 'sveltekit-virtual'

/**
 * @type {Required<import('.').AdapterOptions>}
 */
const defaultOptions = {
  precompress: false,
  out: 'build',
  polyfill: true,
  envPrefix: '',
  s3Directory: 's3',
  lambdaDirectory: 'lambda',
  lambdaAtEdgeDirectory: 'lambda@edge',
  lambdaUpload: () => {
    // noop
  },
}

/**
 * @type {import('.').default}
 */
function createAdapter(userOptions = {}) {
  const options = { ...defaultOptions, ...userOptions }

  /**
   * @type {import('.').ExtendedAdapter}
   */
  const adapter = {
    ...options,

    name: '@ap0nia/sveltekit-aws',

    /**
     * @param {import('@sveltejs/kit').Builder} builder
     */
    async adapt(builder) {
      /**
       * Temporary directory is created in the default SvelteKit outputs directory.
       *
       * @example '.svelte-kit/output/server/adapter-node'
       */
      const temporaryDirectory = path.join(builder.getServerDirectory(), 'sveltekit-adapter-lambda')

      /**
       * Some SvelteKit thing that determines internal routing.
       */
      const manifest = `${temporaryDirectory}/manifest.js`

      /**
       * The built SvelteKit server.
       */
      const server = `${temporaryDirectory}/index.js`

      /**
       * Includes:
       * - Components pre-rendered as HTML files.
       * - JS files referenced by the pre-rendered HTML files.
       *
       * @example 'build/s3'
       */
      const s3Directory = path.join(options.out, options.s3Directory, builder.config.kit.paths.base)

      /**
       * Files needed to handle lambda events.
       *
       * @example 'build/lambda'
       */
      const lambdaDirectory = path.join(options.out, options.lambdaDirectory)

      builder.log.minor(`Cleaning ${options.out} and ${temporaryDirectory}`)

      builder.rimraf(options.out)
      builder.mkdirp(options.out)

      builder.rimraf(temporaryDirectory)
      builder.mkdirp(temporaryDirectory)

      builder.log.minor('Copying assets')

      builder.writeClient(s3Directory)

      const prerenderedFiles = builder.writePrerendered(lambdaDirectory)

      // Also copy the prerendered (static) files to the S3 directory.
      builder.writePrerendered(s3Directory)

      if (options.precompress) {
        builder.log.minor('Compressing assets')
        await builder.compress(s3Directory)
      }

      builder.log.minor('Building server')

      builder.writeServer(temporaryDirectory)

      const prerenderedCandidates = createPrerenderedCandidates(prerenderedFiles)

      // Dynamically create a manifest in the temporary directory.
      fs.writeFileSync(
        manifest,
        `export const manifest = ${builder.generateManifest({ relativePath: './' })};\n\n` +
          `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});\n`,
      )

      // The files being built are located in __this project__,
      // so `__dirname` is used to resolve the paths starting from this file.
      await esbuild.build({
        entryPoints: {
          [`${options.lambdaDirectory}/index`]: path.join(__dirname, 'build', 'lambda', 'index.js'),
        },
        bundle: true,
        outExtension: { '.js': '.mjs' },
        format: 'esm',
        platform: 'node',
        outdir: options.out,
        banner: { js },
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
                  namespace,
                }
              })

              build.onResolve({ filter: /PRERENDERED/ }, (args) => {
                return {
                  path: args.path,
                  namespace,
                }
              })

              build.onLoad({ filter: /SHIMS/, namespace }, () => {
                return {
                  resolveDir: 'node_modules',
                  contents: options.polyfill
                    ? `import { installPolyfills } from '@sveltejs/kit/node/polyfills'; installPolyfills();`
                    : '',
                }
              })
              build.onLoad({ filter: /PRERENDERED/, namespace }, () => {
                return {
                  contents: `export const prerenderedMappings = new Map(${JSON.stringify(
                    prerenderedCandidates,
                  )});\n`,
                }
              })
            },
          },
        ],
      })

      await esbuild.build({
        entryPoints: {
          [`${options.lambdaAtEdgeDirectory}/index`]: path.join(
            __dirname,
            'build',
            'lambda@edge',
            'index.js',
          ),
        },
        bundle: true,
        format: 'cjs',
        target: ['es6'],
        platform: 'node',
        outdir: options.out,
        plugins: [
          {
            name: 'sveltekit-adapter-node-resolver',
            setup(build) {
              build.onResolve({ filter: /PRERENDERED/ }, (args) => {
                return {
                  path: args.path,
                  namespace,
                }
              })

              build.onLoad({ filter: /PRERENDERED/, namespace }, () => {
                return {
                  contents: `export const prerenderedMappings = new Map(${JSON.stringify(
                    prerenderedCandidates,
                  )});\n`,
                }
              })
            },
          },
        ],
      })

      await options.lambdaUpload(lambdaDirectory)
    },
  }

  return adapter
}

/**
 * Create all the possible mappings of paths to prerendered files.
 * This makes it easy to convert paths to files during Lambda events.
 *
 * @example /sverdle/how-to-play -> /sverdle/how-to-play.html
 *
 * @param {string[]} prerenderedFiles
 * @returns {string[][]}
 */
function createPrerenderedCandidates(prerenderedFiles) {
  /**
   * Prerendered paths
   * @example /sverdle/how-to-play
   */
  const prerenderedCandidates = prerenderedFiles.flatMap((file) => {
    const htmlFileNoExtension = file.replace(/\.html$/, '')

    const candidates = [
      [file, file],
      [`/${file}`, file],
      [htmlFileNoExtension, file],
      [`/${htmlFileNoExtension}`, file],
    ]

    if (file.endsWith('.html')) {
      candidates.push(
        [file.replace(/\/index\.html$/, ''), file],
        [`${htmlFileNoExtension}/index`, file],
        [`${htmlFileNoExtension}/index.html`, file],
        [`/${htmlFileNoExtension}/index.html`, file],
      )
    }

    if (file === 'index.html') {
      candidates.push(['/', file], ['', file])
    }

    return candidates
  })

  return prerenderedCandidates
}

export default createAdapter
