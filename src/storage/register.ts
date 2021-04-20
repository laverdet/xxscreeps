import 'xxscreeps/config/mods/import/storage';
import type { UnionToIntersection } from 'xxscreeps/utility/types';
import type { BlobProvider, KeyValProvider, PubSubProvider } from './provider';
import { configPath } from 'xxscreeps/config';

type DispositionToProvider<T> =
	T extends 'blob' ? BlobProvider :
	T extends 'keyval' ? KeyValProvider :
	T extends 'pubsub' ? PubSubProvider :
	never;

/**
 * Register a storage provider for a given URI scheme and disposition
 * @param scheme Name of URI scheme
 * @param dispositions Array of 'blob', 'keyval', or 'pubsub' depending on the capabilities of the
 * provider
 * @param provider Callback to connect to given URI
 */
export function registerStorageProvider<Dispositions extends string>(
	schemes: string | string[],
	dispositions: Dispositions | Dispositions[],
	provider: (url: URL, disposition: Dispositions) => Promise<UnionToIntersection<DispositionToProvider<Dispositions>>>,
) {
	// TODO: This is messy
	const providers = (registerStorageProvider as any).providers ??= new Map<any, any>();
	for (const scheme of Array.isArray(schemes) ? schemes : [ schemes ]) {
		for (const disposition of Array.isArray(dispositions) ? dispositions : [ dispositions ]) {
			const key = `${scheme}:${disposition}`;
			if (providers.has(key)) {
				throw new Error(`Storage provider conflict-- ${key}`);
			}
			providers.set(key, provider);
		}
	}
}

export async function connectToProvider<Disposition extends string>(fragment: string, disposition: Disposition):
Promise<DispositionToProvider<Disposition>> {
	const providers = (registerStorageProvider as any).providers;
	const url = new URL(fragment, configPath);
	const provider = providers.get(url.protocol + disposition);
	if (!provider) {
		throw new Error(`No storage provider for ${url.protocol}${disposition}`);
	}
	return provider(url, disposition) as Promise<any>;
}
