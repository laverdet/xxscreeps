import type { BlobProvider, KeyValProvider, PubSubProvider } from 'xxscreeps/engine/storage';
import type { Effect } from 'xxscreeps/utility/types';
import { connectToProvider } from 'xxscreeps/engine/storage';
import config from 'xxscreeps/config';
import { acquire } from 'xxscreeps/utility/async';

export class Database {
	// Ensure this isn't compatible with `Shard`
	declare private readonly _: any;

	private constructor(
		private readonly effect: Effect,
		public readonly blob: BlobProvider,
		public readonly data: KeyValProvider,
		public readonly pubsub: PubSubProvider,
	) {}

	static async connect() {
		const info = config.database;
		const [ effect, [ blob, data, pubsub ] ] = await acquire(
			connectToProvider(info.blob, 'blob'),
			connectToProvider(info.data, 'keyval'),
			connectToProvider(info.pubsub, 'pubsub'),
		);
		return new Database(effect, blob, data, pubsub);
	}

	disconnect() {
		this.effect();
	}

	save() {
		return Promise.all([ this.data.save(), this.blob.save() ]);
	}
}
