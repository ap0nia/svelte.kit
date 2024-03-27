// @ts-check

// import adapter from '@svelte.kit/adapter-aws';
import adapter from '@jill64/sveltekit-adapter-aws';
import { vitePreprocess } from '@sveltejs/kit/vite';

/**
 * @type{import('@sveltejs/kit').Config}
 */
const config = {
	preprocess: [vitePreprocess()],
	kit: {
		adapter: adapter({
			name: 'bruh-sverdle',
			deploy: true,
			architecture: 'lambda-s3'
			// ...
			// Other Adapter Options
			// ...
		})
		// adapter: adapter({
		//   stream: true
		// })
	}
};

export default config;
