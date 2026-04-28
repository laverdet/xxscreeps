import type { KeyValProvider, PubSubProvider } from 'xxscreeps/engine/db/storage/index.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import config from 'xxscreeps/config/index.js';
import { connectToProvider } from 'xxscreeps/engine/db/storage/index.js';
import { acquire } from 'xxscreeps/utility/async.js';

export class Database {
	readonly data;
	readonly pubsub;
	// Ensure this isn't compatible with `Shard`
	declare private readonly '#private': any;
	private readonly effect;

	private constructor(effect: Effect, data: KeyValProvider, pubsub: PubSubProvider) {
		this.effect = effect;
		this.data = data;
		this.pubsub = pubsub;
	}

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

	[Symbol.dispose]() {
		this.effect();
	}

	save() {
		return this.data.save();
	}
}
