// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

import esbuild from 'esbuild'

/**
 * Absolute path to this file.
 * Used for resolving relative paths to template files in this project.
 */
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

/**
 * @type {Required<import('.').AdapterOptions>}
 */
const defaultOptions = {
  precompress: true,
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
 * Name of adapter.
 */
const name = 'adapter-aws'

/**
 * Custom namespace for resolving virtual files.
 */
const namespace = '\0sveltekit-virtual'

/**
 * Relative location of the lambda handler template file from this file.
 */
const localTemplateLambdaFunction = path.join('build', 'lambda', 'index.js')

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
 * @type {import('.').default}
 */
function createAdapter(userOptions = {}) {
  const options = { ...defaultOptions, ...userOptions }

  /**
   * @type {import('.').ExtendedAdapter}
   */
  const adapter = {
    ...options,

    name,

    /**
     * @param {import('@sveltejs/kit').Builder} builder
     */
    async adapt(builder) {
      /**
       * Out directory.
       */
      const outdir = path.resolve(options.out)

      /**
       * Upload static assets to S3.
       */
      const s3Directory = path.join(outdir, options.s3Directory, builder.config.kit.paths.base)

      /**
       * Lambda directory.
       */
      const lambdaDirectory = path.join(outdir, options.lambdaDirectory)

      /**
       * Generated contents from SvelteKit go into a nested directory.
       */
      const serverDirectory = path.join(lambdaDirectory, 'server')

      /**
       * Write the manifest to the root of the SvelteKit server directory.
       */
      const manifest = path.join(serverDirectory, 'manifest.js')

      /**
       * Default location of generated SvelteKit server entrypoint.
       */
      const server = path.join(serverDirectory, 'index.js')

      /**
       * Location of the template file to use for the Lambda function.
       */
      const templateLambdaFunction = path.join(__dirname, localTemplateLambdaFunction)

      /**
       * Lambda handler.
       */
      const lambdaFunction = path.join(lambdaDirectory, 'index')

      /**
       * package.json to add to Lambda directory.
       */
      const lambdaPackageJson = path.join(lambdaDirectory, 'package.json')

      builder.rimraf(options.out)
      builder.mkdirp(options.out)

      builder.writeClient(s3Directory)

      if (options.precompress) {
        await builder.compress(s3Directory)
      }

      builder.writeServer(serverDirectory)

      fs.writeFileSync(
        manifest,
        [
          `export const manifest = ${builder.generateManifest({ relativePath: './' })};`,
          `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
          `export const base = ${JSON.stringify(builder.config.kit.paths.base)};`,
        ].join('\n'),
      )

      await esbuild.build({
        entryPoints: {
          [lambdaFunction]: templateLambdaFunction,
        },
        bundle: true,
        format: 'esm',
        platform: 'node',
        outdir,
        banner: { js },
        plugins: [
          {
            name: `${name}-resolver`,
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

              build.onLoad({ filter: /SHIMS/, namespace }, () => {
                return {
                  resolveDir: 'node_modules',
                  contents: options.polyfill
                    ? `import { installPolyfills } from '@sveltejs/kit/node/polyfills';\n\ninstallPolyfills();`
                    : '',
                }
              })
            },
          },
        ],
      })

      /**
       * Custom `package.json` to enforce ESM in Lambda.
       */
      fs.writeFileSync(lambdaPackageJson, JSON.stringify({ type: 'module' }))

      /**
       * User can perform any post-processing here, e.g. modify the Lambda directory.
       */
      await options.lambdaUpload(lambdaDirectory)
    },
  }

  return adapter
}

export default createAdapter
