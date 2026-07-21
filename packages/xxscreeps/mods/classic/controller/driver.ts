import type { GlobalControlChannel } from './model.js';
import type { DeferListener, MessageFor } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { hooks as processorHooks } from 'xxscreeps/engine/processor/index.js';
import { hooks } from 'xxscreeps/engine/runner/index.js';
import { DisposableResource } from 'xxscreeps/utility/utility.js';
import { controlledRoomsKey, globalControlChannel, insertControlledRoom } from './model.js';

class GlobalControlWatcher extends DisposableResource {
	gcl;
	controlledRooms;

	private constructor(disposable: DisposableStack, gcl: number, reservedRooms: string[], listen: DeferListener<MessageFor<GlobalControlChannel>>) {
		super(disposable);
		this.gcl = gcl;
		this.controlledRooms = new Set(reservedRooms);
		listen(event => {
			switch (event.type) {
				case 'gcl':
					this.gcl = Math.max(this.gcl, event.gcl);
					break;

				case 'insertRoom':
					this.controlledRooms.add(event.roomName);
					break;

				case 'removeRoom':
					this.controlledRooms.delete(event.roomName);
					break;
			}
		});
	}

	get controlledRoomCount() {
		return this.controlledRooms.size;
	}

	static async create(shard: Shard, userId: string) {
		using disposable = new DisposableStack();
		const channel = globalControlChannel(shard, userId);
		const subscription = disposable.use(await channel.subscribe());
		const listen = subscription.listenDeferred();
		const [ gcl, reservedRooms ] = await Promise.all([
			shard.db.data.hGet(User.infoKey(userId), 'gcl'),
			shard.scratch.sMembers(controlledRoomsKey(userId)),
		]);
		return new GlobalControlWatcher(disposable.move(), Number(gcl) || 0, reservedRooms, listen);
	}
}

processorHooks.register('refreshRoom', async (shard, room) => {
	const userId = room['#user'];
	if (userId != null) {
		if (room['#level'] > 0) {
			await insertControlledRoom(shard, userId, room.name);
		}
	}
});

hooks.register('runnerConnector', async player => {
	const { shard, userId } = player;
	const watcher = await GlobalControlWatcher.create(shard, userId);
	return [ () => watcher.dispose(), {
		refresh(payload) {
			payload.gcl = watcher.gcl;
			payload.controlledRoomCount = watcher.controlledRoomCount;
		},
	} ];
});

// ---

declare module 'xxscreeps/engine/runner/index.js' {
	interface TickPayload {
		controlledRoomCount: number;
		gcl: number;
	}
}
