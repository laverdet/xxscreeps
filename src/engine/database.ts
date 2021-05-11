import type { BlobProvider, KeyValProvider, PubSubProvider } from 'xxscreeps/engine/storage';
import { connectToProvider } from 'xxscreeps/engine/storage';
import config from 'xxscreeps/config';

export class Database {
	// Ensure this isn't compatible with `Shard`
	declare private readonly _: any;

	private constructor(
		public readonly blob: BlobProvider,
		public readonly data: KeyValProvider,
		public readonly pubsub: PubSubProvider,
	) {}

	static async connect() {
		const info = config.database;
		const [ blob, data, pubsub ] = await Promise.all([
			connectToProvider(info.blob, 'blob'),
			connectToProvider(info.data, 'keyval'),
			connectToProvider(info.pubsub, 'pubsub'),
		]);
		return new Database(blob, data, pubsub);
	}

	disconnect() {
		this.blob.disconnect();
		this.data.disconnect();
		this.pubsub.disconnect();
	}

	save() {
		return Promise.all([ this.data.save(), this.blob.save() ]);
	}
}
