import type { URL } from 'url';
import type { Redis } from 'ioredis';
import ioredis from 'ioredis';
import { listen } from 'xxscreeps/utility/async';
export type { Redis };

declare module 'ioredis' {
	interface Redis {
		copy(from: string, to: string, replace?: 'replace'): Promise<number>;
		mgetBuffer(keys: string[]): Promise<(Buffer | null)[]>;
		zmscore(key: string, members: string[]): Promise<number[]>;
	}
}

export async function makeClient(url: URL, blob = false) {
	const client = new ioredis(`${url}`, {
		dropBufferSupport: !blob,
		// enableAutoPipelining: !blob,
		enableOfflineQueue: false,
		enableReadyCheck: true,
		maxRetriesPerRequest: 0,
		reconnectOnError: () => false,
	});
	await new Promise<void>((resolve, reject) => {
		const unlisten1 = listen(client, 'ready', () => { unlisten(); resolve() });
		const unlisten2 = listen(client, 'error', error => { unlisten(); reject(error) });
		const unlisten = (): void => { unlisten1(); unlisten2() };
	});
	client.on('error', error => {
		console.error(error.message);
		process.exit();
	});
	return client;
}
