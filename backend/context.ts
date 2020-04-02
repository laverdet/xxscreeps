import { readGame } from '~/engine/metabase/game';
import { readWorld, World } from '~/game/map';
import type { MainMessage } from '~/engine/service';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';

export class BackendContext {
	private constructor(
		public readonly blobStorage: BlobStorage,
		public readonly mainChannel: Channel<MainMessage>,
		public readonly world: World,
		public readonly accessibleRooms: Set<string>,
		public time: number,
	) {
		// Keep current time up to date
		mainChannel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		});
	}

	static async connect() {
		// Connect to services
		const blobStorage = await BlobStorage.connect();
		const mainChannel = await Channel.connect<MainMessage>('main');
		const world = readWorld(await blobStorage.load('terrain'));
		const game = readGame(await blobStorage.load('game'));
		return new BackendContext(blobStorage, mainChannel, world, game.accessibleRooms, game.time);
	}
}
