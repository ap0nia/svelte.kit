// @ts-check

import path from 'node:path'
import adapter from '@svelte.kit/adapter-aws'
import prisma from '@svelte.kit/adapter-aws/recipes/prisma'
import { vitePreprocess } from '@sveltejs/kit/vite'

const projectRoot = process.cwd()
const engine = path.join(
  projectRoot,
  'node_modules',
  'prisma',
  'libquery_engine-rhel-openssl-1.0.x.so.node',
)
const schema = path.join(projectRoot, 'prisma', 'schema.prisma')

/**
 * @type{import('@sveltejs/kit').Config}
 */
const config = {
  preprocess: [vitePreprocess()],
  kit: {
    adapter: adapter({
      stream: true,
      lambdaUpload: prisma({ engine, schema }),
    }),
  },
}

export default config
