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
  esbuild: {},
  domainName: '',
  prerenderedDirectory: 'prerendered',
  lambdaHandler: 'index.handler',
  cloudfrontDirectory: 'cloudfront',
  stream: false,
  precompress: true,
  out: 'build',
  polyfill: true,
  envPrefix: '',
  s3Directory: 's3',
  lambdaDirectory: 'lambda',
  lambdaUpload: () => {
    // noop
  },
}

/**
 * Name of adapter.
 */
export const name = 'adapter-aws'

/**
 * Custom namespace for resolving virtual files.
 */
const namespace = '\0sveltekit-virtual'

/**
 * The directory at `src/build/lambda`.
 */
const handlerTemplateDirectory = path.join('build', 'lambda')

/**
 * The source file at `src/build/lambda/buffered.ts`
 */
const bufferedHandlerTemplate = 'buffered.ts'

/**
 * The source file at `src/build/lambda/streamed.ts`
 */
const streamedHandlerTemplate = 'streamed.ts'

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
    adapt: async (builder) => {
      /**
       * Out directory.
       */
      const outdir = path.resolve(options.out)

      /**
       * Directory for static assets to upload to AWS S3.
       */
      const s3Directory = path.join(outdir, options.s3Directory, builder.config.kit.paths.base)

      /**
       * Directory for compiled CloudFront Functions.
       */
      const cloudfrontDirectory = path.join(outdir, options.cloudfrontDirectory)

      /**
       * Directory for files to upload to AWS Lambda.
       */
      const lambdaDirectory = path.join(outdir, options.lambdaDirectory)

      /**
       * Directory for SvelteKit server contents in the AWS Lambda function.
       */
      const serverDirectory = path.join(lambdaDirectory, 'server')

      /**
       * Directory for prerendered files.
       */
      const prerenderedDirectory = path.join(lambdaDirectory, options.prerenderedDirectory)

      /**
       * File with important metadata.
       */
      const manifest = path.join(serverDirectory, 'manifest.js')

      /**
       * Entrypoint of SvelteKit server.
       * AWS Lambda handler imports the server and wraps the handling process.
       */
      const server = path.join(serverDirectory, 'index.js')

      /**
       * Location of AWS Lambda handler template.
       * Compile with the SvelteKit server entrypoint to create a valid AWS Lambda handler.
       */
      const templateLambdaFunction = path.join(
        __dirname,
        handlerTemplateDirectory,
        options.stream ? streamedHandlerTemplate : bufferedHandlerTemplate,
      )

      /**
       * Location of the compiled AWS Lambda handler.
       */
      const lambdaFunction = path.join(lambdaDirectory, 'index')

      const templateCloudfrontFunction = path.join(__dirname, 'build', 'cloudfront', 'index.ts')

      const cloudfrontFunction = path.join(cloudfrontDirectory, 'index')

      builder.rimraf(options.out)
      builder.mkdirp(options.out)

      builder.log.info(`Writing static assets to ${s3Directory}`)
      builder.writeClient(s3Directory)

      if (options.precompress) {
        await builder.compress(s3Directory)
      }

      builder.log.info(`Writing server to ${serverDirectory}`)
      builder.writeServer(serverDirectory)

      const prerenderedFiles = builder.writePrerendered(prerenderedDirectory)
      const prerenderedFileMappings = generatePrerenderedFileMappings(
        prerenderedFiles,
        options.prerenderedDirectory,
      )

      fs.writeFileSync(
        manifest,
        [
          `export const manifest = ${builder.generateManifest({ relativePath: './' })};`,
          `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
          `export const base = ${JSON.stringify(builder.config.kit.paths.base)};`,
          `export const prerenderedFileMappings = new Map(${JSON.stringify(
            prerenderedFileMappings,
          )});`,
        ].join('\n'),
      )

      /**
       * @type {esbuild.Plugin}
       */
      const resolverPlugin = {
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
      }

      /**
       * @type {Record<string, string>}
       */
      const define = {
        DOMAIN_NAME: JSON.stringify(options.domainName),
      }

      /**
       * @type {esbuild.BuildOptions}
       */
      const defaultBuildOptions = {
        entryPoints: {
          [lambdaFunction]: templateLambdaFunction,
        },
        bundle: true,
        platform: 'node',
        outdir,
        define,
        plugins: [resolverPlugin],
      }

      const buildOptions =
        typeof options.esbuild === 'function'
          ? options.esbuild(defaultBuildOptions)
          : options.esbuild

      builder.log.info(`Compiling Lambda function to ${lambdaFunction}`)
      await esbuild.build(buildOptions)

      builder.log.info(`Compiling CloudFront function to ${cloudfrontFunction}`)

      const globalName = 'main'

      /**
       * @see https://github.com/jill64/cf2-builder/blob/main/src/cmd.ts
       */
      await esbuild.build({
        entryPoints: {
          [cloudfrontFunction]: templateCloudfrontFunction,
        },
        bundle: true,
        target: 'es5',
        platform: 'neutral',
        format: 'iife',
        globalName,
        outdir,
        define,
        plugins: [resolverPlugin],
        footer: {
          js: `function handler (event) { return ${globalName}.default(event); }`,
        },
      })

      /**
       * User can perform any post-processing here, e.g. modify the Lambda directory.
       */
      await options.lambdaUpload(lambdaDirectory)
    },
  }

  return adapter
}

/**
 * Generate all possible mappings of paths to prerendered routes.
 *
 * This optimizes checks performed by Lambda functions and is compatible
 * with AWS CloudFront Functions for re-writing origin requests.
 *
 * @example
 * Prerendered route: '/sverdle/how-to-play'
 * Mappings:
 * [
 *   ['/sverdle/how-to-play', 'sverdle/how-to-play'],
 *   ['/sverdle/how-to-play.html', 'sverdle/how-to-play'],
 *   ['/sverdle/how-to-play/index', 'sverdle/how-to-play'],
 *   ['/sverdle/how-to-play/index.html', 'sverdle/how-to-play'],
 *   //...
 * ],
 *
 * @param {string[]} prerenderedFiles An array of prerendered files.
 * @param {string} prefix A prefix, i.e. sub-directory, for the prerendered files.
 * @returns {string[][]} An array of tuple mappings.
 */
function generatePrerenderedFileMappings(prerenderedFiles, prefix = '') {
  return prerenderedFiles.flatMap((file) => {
    const htmlFileNoExtension = file.replace(/\.html$/, '')
    const filePath = path.join(prefix, file)

    const candidates = [
      [file, filePath],
      [`/${file}`, filePath],
      [htmlFileNoExtension, filePath],
      [`/${htmlFileNoExtension}`, filePath],
    ]

    if (file.endsWith('.html')) {
      candidates.push(
        [file.replace(/\/index\.html$/, ''), filePath],
        [`${htmlFileNoExtension}/index`, filePath],
        [`/${htmlFileNoExtension}/index`, filePath],
        [`${htmlFileNoExtension}/index.html`, filePath],
        [`/${htmlFileNoExtension}/index.html`, filePath],
      )
    }

    if (file === 'index.html') {
      candidates.push(['/', filePath], ['', filePath])
    }

    return candidates
  })
}

export default createAdapter
