// @ts-check

import ci from 'ci-info'
import relativeLinks from 'astro-relative-links'
import starlight from '@astrojs/starlight'

import { repository } from './package.json'

// const repositoryName = repository.url.split('/').pop() ?? ''

/**
 * @returns {import('astro/config').AstroUserConfig}
 */
function defineConfig() {
  /**
   * @type {import('astro/config').AstroUserConfig}
   */
  const config = {
    integrations: [
      starlight({
        title: 'Svelte.Kit',
        social: {
          github: 'https://github.com/ap0nia/svelte.kit',
        },
        sidebar: [
          {
            label: 'Packages',
            autogenerate: {
              directory: 'packages',
            },
          },
        ],
      }),

      relativeLinks(),
    ],

    // Process images with sharp: https://docs.astro.build/en/guides/assets/#using-sharp
    image: {
      service: {
        entrypoint: 'astro/assets/services/sharp',
      },
    },
  }

  if (ci.isCI) {
    config.site = repository.url
    // config.base = `/${repositoryName}`
  }

  return config
}

const config = defineConfig()

export default config
