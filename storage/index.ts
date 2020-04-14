import * as Path from 'path';
import config, { configPath } from '~/engine/config';
import { LocalEphemeralProvider } from './local/ephemeral';
import { LocalPersistenceProvider } from './local/persistence';
import { LocalPubsubProvider } from './local/pubsub';
import { EphemeralProvider, PersistenceProvider, Provider } from './provider';
export { EphemeralProvider, PersistenceProvider, Provider };

let provider: Provider;
const path = Path.join(Path.dirname(configPath), config.storage?.path ?? './data');

export async function initialize() {
	provider = new Provider(
		await LocalEphemeralProvider.create('shard0'),
		await LocalPersistenceProvider.create(path),
		LocalPubsubProvider.connect('shard0'),
	);
}

export async function connect(name: string) {
	if (name !== 'shard0') {
		throw new Error('Missing provider name');
	}
	return new Provider(
		await LocalEphemeralProvider.connect('shard0'),
		await LocalPersistenceProvider.connect(path),
		LocalPubsubProvider.connect('shard0'),
	);
}

export function terminate() {
	provider.disconnect();
}
