import { App, Stack } from 'aws-cdk-lib';
import { SvelteKit } from '@svelte.kit/cdk';

async function main() {
	const stackName = `sveltekit-adapter-aws-sverdle`;

	const app = new App({ autoSynth: true });

	const stack = new Stack(app, stackName);

	const sveltekit = new SvelteKit(stack, stackName);

	await sveltekit.initialize();
}

await main();
