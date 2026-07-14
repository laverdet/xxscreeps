import type { DeferListener } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { AsyncDisposableResource } from 'xxscreeps/utility/utility.js';

export const controlledRoomsKey = (userId: string) => `user/${userId}/controlledRooms`;
export const reservedRoomsKey = (userId: string) => `user/${userId}/reservedRooms`;

type GlobalControlMessages = GlobalControlMessage | InsertRoomMessage | RemoveRoomMessage;

interface GlobalControlMessage {
	type: 'gcl';
	gcl: number;
}

interface InsertRoomMessage {
	type: 'insertRoom';
	roomName: string;
}

interface RemoveRoomMessage {
	type: 'removeRoom';
	roomName: string;
}

function globalControlChannel(shard: Shard, userId: string) {
	return new Channel<GlobalControlMessages>(shard.pubsub, `user/${userId}/globalControl`);
}

export function insertControlledRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return Promise.all([
		globalControlChannel(shard, userId).publish({ type: 'insertRoom', roomName }),
		shard.scratch.sAdd(controlledRoomsKey(userId), [ roomName ]),
		shard.scratch.sRem(reservedRoomsKey(userId), [ roomName ]),
	]);
}

export function removeControlledRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return Promise.all([
		globalControlChannel(shard, userId).publish({ type: 'removeRoom', roomName }),
		shard.scratch.sRem(controlledRoomsKey(userId), [ roomName ]),
	]);
}

export function insertReservedRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return shard.scratch.sAdd(reservedRoomsKey(userId), [ roomName ]);
}

export function removeReservedRoom(shard: Shard, userId: string, roomName: string): Promise<unknown> {
	return shard.scratch.sRem(reservedRoomsKey(userId), [ roomName ]);
}

export async function incrementGlobalControlLevel(shard: Shard, userId: string, upgradePower: number) {
	const gcl = await shard.db.data.hincrBy(User.infoKey(userId), 'gcl', upgradePower);
	await globalControlChannel(shard, userId).publish({ type: 'gcl', gcl });
}

export class GlobalControlWatcher extends AsyncDisposableResource {
	gcl;
	controlledRooms;

	private constructor(disposable: DisposableStack, gcl: number, reservedRooms: string[], listen: DeferListener<GlobalControlMessages>) {
		super();
		this.disposable.use(disposable);
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
		const subscription = disposable.adopt(await channel.subscribe(), channel => channel.disconnect());
		const listen = subscription.listenDeferred();
		const [ gcl, reservedRooms ] = await Promise.all([
			shard.data.hGet(User.infoKey(userId), 'gcl'),
			shard.scratch.sMembers(controlledRoomsKey(userId)),
		]);
		return new GlobalControlWatcher(disposable.move(), Number(gcl) || 0, reservedRooms, listen);
	}
}
