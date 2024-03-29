import 'dotenv/config'
import { SvelteKit } from '@svelte.kit/cdk'
import { App, Stack } from 'aws-cdk-lib'

async function main() {
  const stackName = `with-prisma`

  const app = new App({ autoSynth: true })

  const stack = new Stack(app, stackName)

  const sveltekit = new SvelteKit(stack, stackName, {
    stream: true,
    constructProps: {
      handler: () => ({
        environment: {
          POSTGRES_PRISMA_URL: process.env['POSTGRES_PRISMA_URL'] ?? '',
        },
      }),
    },
  })

  await sveltekit.init()
}

main()
