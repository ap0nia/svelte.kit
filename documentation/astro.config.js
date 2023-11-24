import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'Svelte.Kit Docs',
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
  ],

  // Process images with sharp: https://docs.astro.build/en/guides/assets/#using-sharp
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
})
