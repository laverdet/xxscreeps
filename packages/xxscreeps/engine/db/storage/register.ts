import type { KeyValProvider, PubSubProvider } from './provider.js';

type DispositionToProvider<T> =
	T extends 'keyval' ? AsyncDisposable & KeyValProvider :
	T extends 'pubsub' ? AsyncDisposable & PubSubProvider :
	never;

type Provider = (url: URL, disposition: any) => Promise<AsyncDisposable>;
const providers = new Map<string, Provider>();

/**
 * Register a storage provider for a given URI scheme and disposition
 * @param scheme Name of URI scheme
 * @param dispositions Array of 'keyval', or 'pubsub' depending on the capabilities of the
 * provider
 * @param provider Callback to connect to given URI
 */
export function registerStorageProvider<Disposition extends 'keyval' | 'pubsub'>(
	schemes: string | string[],
	disposition: Disposition,
	provider: (url: URL, disposition: Disposition) => Promise<DispositionToProvider<Disposition>>,
) {
	for (const scheme of Array.isArray(schemes) ? schemes : [ schemes ]) {
		const key = `${scheme}:${disposition}`;
		if (providers.has(key)) {
			throw new Error(`Storage provider conflict-- ${key}`);
		}
		providers.set(key, provider);
	}
}

export async function connectToProvider<Disposition extends string>(fragment: string, disposition: Disposition): Promise<DispositionToProvider<Disposition>> {
	const [ { configPath } ] = await Promise.all([
		import('xxscreeps/config/index.js'),
		import('xxscreeps:mods/storage'),
	]);
	const url = new URL(fragment, configPath);
	const provider = providers.get(url.protocol + disposition);
	if (provider) {
		const host = await provider(url, disposition);
		return host satisfies AsyncDisposable as DispositionToProvider<Disposition>;
	} else {
		throw new Error(`No storage provider for ${url.protocol}${disposition}`);
	}
}
