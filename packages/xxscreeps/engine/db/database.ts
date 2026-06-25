import type { KeyValProvider, PubSubProvider } from 'xxscreeps/engine/db/storage/index.js';
import { config } from 'xxscreeps/config/index.js';
import { connectToProvider } from 'xxscreeps/engine/db/storage/index.js';
import { acquireWith } from 'xxscreeps/utility/async.js';

export class Database {
	readonly data;
	readonly pubsub;
	readonly disposable;
	// Ensure this isn't compatible with `Shard`
	declare private readonly '#private': any;

	private constructor(disposable: AsyncDisposableStack, data: KeyValProvider, pubsub: PubSubProvider) {
		this.disposable = disposable;
		this.data = data;
		this.pubsub = pubsub;
	}

	static async connect(info: {
		data: string;
		pubsub: string;
	} = config.database) {
		await using disposable = new AsyncDisposableStack();
		const [ data, pubsub ] = await acquireWith(
			resource => disposable.use(resource),
			connectToProvider(info.data, 'keyval'),
			connectToProvider(info.pubsub, 'pubsub'),
		);
		return new Database(disposable.move(), data, pubsub);
	}

	[Symbol.asyncDispose]() {
		return this.disposable.disposeAsync();
	}

	save() {
		return this.data.save();
	}
}
