import * as Path from 'path';
import config, { configPath } from 'xxscreeps/config';
import { LocalBlobProvider } from './local/blob';
import { LocalKeyValProvider } from './local/keyval';
import { LocalPubSubProvider } from './local/pubsub';
import { Provider } from './provider';
export { Provider };

let provider: Provider;
const path = Path.resolve(Path.dirname(configPath), config.storage?.path ?? './data');

export async function initialize() {
	provider = new Provider(
		await LocalBlobProvider.create(path),
		await LocalKeyValProvider.create('shard0'),
		LocalPubSubProvider.connect('shard0'),
	);
}

export async function connect(name: string) {
	if (name !== 'shard0') {
		throw new Error('Missing provider name');
	}
	return new Provider(
		await LocalBlobProvider.connect(path),
		await LocalKeyValProvider.connect('shard0'),
		LocalPubSubProvider.connect('shard0'),
	);
}

export function terminate() {
	provider.disconnect();
}
