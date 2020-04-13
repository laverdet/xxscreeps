import * as Path from 'path';
import config, { configPath } from '~/engine/config';
import { PersistenceProvider } from './provider';
import { LocalPersistenceProvider } from './local/persistence';
export { PersistenceProvider };

let persistenceProvider: LocalPersistenceProvider;
const path = Path.join(Path.dirname(configPath), config.storage?.path ?? './data');

export async function initialize() {
	persistenceProvider = await LocalPersistenceProvider.create(path);
}

export async function connect(name: string): Promise<PersistenceProvider> {
	if (name !== 'shard0') {
		throw new Error('Missing persistence name');
	}
	return LocalPersistenceProvider.connect(path);
}

export function terminate() {
	persistenceProvider.disconnect();
}
