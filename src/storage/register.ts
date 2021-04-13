import type { UnionToIntersection } from 'xxscreeps/utility/types';
import type { BlobProvider, KeyValProvider, PubSubProvider } from './provider';
import { pathToFileURL } from 'url';
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
	scheme: string,
	dispositions: Dispositions[],
	provider: (uri: string) => Promise<UnionToIntersection<DispositionToProvider<Dispositions>>>,
) {
	// TODO: This is messy
	const providers = (registerStorageProvider as any).providers ??= new Map<any, any>();
	for (const disposition of dispositions) {
		providers.set(`${scheme}:${disposition}`, provider);
	}
}

export async function connectToProvider<Disposition extends string>(uri: string, disposition: Disposition):
Promise<DispositionToProvider<Disposition>> {
	const providers = (registerStorageProvider as any).providers;
	const info = new URL(uri, pathToFileURL(configPath));
	const provider = providers.get(info.protocol + disposition);
	if (!provider) {
		throw new Error(`No storage provider for ${info.protocol}${disposition}`);
	}
	return provider(`${info}`) as Promise<any>;
}
