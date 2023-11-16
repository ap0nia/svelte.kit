import { App } from 'aws-cdk-lib';
import { SvelteKitStack } from '@svelte.kit/cdk';

async function main() {
	const stackName = `sveltekit-adapter-aws-test`;

	const app = new App({ autoSynth: true });

	new SvelteKitStack(app, stackName);
}

main();
