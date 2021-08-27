import type { KeyValProvider, PubSubProvider } from 'xxscreeps/engine/db/storage';
import type { Effect } from 'xxscreeps/utility/types';
import { connectToProvider } from 'xxscreeps/engine/db/storage';
import config from 'xxscreeps/config';
import { acquire } from 'xxscreeps/utility/async';

export class Database {
	// Ensure this isn't compatible with `Shard`
	declare private readonly _: any;

	private constructor(
		private readonly effect: Effect,
		public readonly data: KeyValProvider,
		public readonly pubsub: PubSubProvider,
	) {}

	static async connect(info: {
		data: string;
		pubsub: string;
	} = config.database) {
		const [ effect, [ data, pubsub ] ] = await acquire(
			connectToProvider(info.data, 'keyval'),
			connectToProvider(info.pubsub, 'pubsub'),
		);
		return new Database(effect, data, pubsub);
	}

	disconnect() {
		this.effect();
	}

	save() {
		return this.data.save();
	}
}
