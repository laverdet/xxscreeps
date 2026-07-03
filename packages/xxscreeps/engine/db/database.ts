import type { KeyValProvider, PubSubProvider } from 'xxscreeps/engine/db/storage/index.js';
import { config } from 'xxscreeps/config/index.js';
import { connectToProvider } from 'xxscreeps/engine/db/storage/index.js';
import { initializeSchemaArchive } from 'xxscreeps/engine/schema/build/index.js';
import { acquireWith } from 'xxscreeps/utility/async.js';
import { AsyncDisposableResource } from 'xxscreeps/utility/utility.js';

export class Database extends AsyncDisposableResource {
	readonly data;
	readonly pubsub;
	// Ensure this isn't compatible with `Shard`
	declare private readonly '#private': any;

	private constructor(disposable: AsyncDisposableStack, data: KeyValProvider, pubsub: PubSubProvider) {
		super(disposable);
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
		await initializeSchemaArchive(data);
		return new Database(disposable.move(), data, pubsub);
	}

	save() {
		return this.data.save();
	}
}
