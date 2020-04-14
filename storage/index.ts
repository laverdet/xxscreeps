import * as Path from 'path';
import config, { configPath } from '~/engine/config';
import { EphemeralProvider, PersistenceProvider } from './provider';
import { LocalEphemeralProvider } from './local/ephemeral';
import { LocalPersistenceProvider } from './local/persistence';
export { EphemeralProvider, PersistenceProvider };

let ephemeralProvider: LocalEphemeralProvider;
let persistenceProvider: LocalPersistenceProvider;
const path = Path.join(Path.dirname(configPath), config.storage?.path ?? './data');

export async function initialize() {
	ephemeralProvider = await LocalEphemeralProvider.create('shard0');
	persistenceProvider = await LocalPersistenceProvider.create(path);
}

export async function connectToEphemeral(name: string): Promise<EphemeralProvider> {
	if (name !== 'shard0') {
		throw new Error('Missing persistence name');
	}
	return LocalEphemeralProvider.connect(name);
}

export async function connectToPersistence(name: string): Promise<PersistenceProvider> {
	if (name !== 'shard0') {
		throw new Error('Missing persistence name');
	}
	return LocalPersistenceProvider.connect(path);
}

export function terminate() {
	ephemeralProvider.disconnect();
	persistenceProvider.disconnect();
}
