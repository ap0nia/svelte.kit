// @ts-check

import adapter from '@svelte.kit/adapter-aws';
import { vitePreprocess } from '@sveltejs/kit/vite';

/**
 * @type{import('@sveltejs/kit').Config}
 */
const config = {
	preprocess: [vitePreprocess()],
	kit: {
		adapter: adapter({
			stream: true
		})
	}
};

export default config;
