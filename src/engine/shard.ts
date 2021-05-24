import type { BlobProvider, KeyValProvider, PubSubProvider } from 'xxscreeps/engine/storage';
import type { Database } from './database';
import type { Effect } from 'xxscreeps/utility/types';
import type { Subscription } from 'xxscreeps/engine/storage/channel';
import * as RoomSchema from 'xxscreeps/engine/room';
import { connectToProvider } from 'xxscreeps/engine/storage';
import { Channel } from 'xxscreeps/engine/storage/channel';
import { World } from 'xxscreeps/game/map';
import config from 'xxscreeps/config';
import { getRoomChannel } from './processor/model';

type Message = { type: 'tick'; time: number } | { type: null };

export class Shard {
	time = -1;
	private readonly gameTickEffect: Effect;

	private constructor(
		public readonly db: Database,
		public readonly name: string,
		public readonly blob: BlobProvider,
		public readonly data: KeyValProvider,
		public readonly pubsub: PubSubProvider,
		public readonly scratch: KeyValProvider,
		public readonly channel: Subscription<Message>,
	) {
		this.gameTickEffect = channel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		});
	}

	static async connect(db: Database, name: string) {
		// Connect to shard, load const data
		const shard = config.shards.find(shard => shard.name === name);
		if (!shard) {
			throw new Error(`Unknown shard: ${shard}`);
		}
		const [ blob, data, pubsub, scratch ] = await Promise.all([
			connectToProvider(shard.blob, 'blob'),
			connectToProvider(shard.data, 'keyval'),
			connectToProvider(shard.pubsub, 'pubsub'),
			connectToProvider(shard.scratch, 'keyval'),
		]);
		const channel = await new Channel<Message>(pubsub, 'channel/game').subscribe();
		// Create instance (which subscribes to tick notification) and then read current info
		const instance = new Shard(db, name, blob, data, pubsub, scratch, channel);
		const time = Number(await data.get('time'));
		instance.time = Math.max(time, instance.time);
		return instance;
	}

	disconnect() {
		this.gameTickEffect();
		this.channel.disconnect();
		this.blob.disconnect();
		this.data.disconnect();
		this.pubsub.disconnect();
		this.scratch.disconnect();
	}

	save() {
		return Promise.all([ this.data.save(), this.blob.save() ]);
	}

	/**
	 * Load and parse shard terrain data
	 */
	async loadWorld() {
		return new World(this.name, await this.blob.reqBuffer('terrain'));
	}

	/**
	 * Load room state from storage for the current or previous tick
	 */
	async loadRoom(name: string, time = this.time, skipInitialization = false) {
		const room = RoomSchema.read(await this.loadRoomBlob(name, time));
		if (!skipInitialization) {
			room['#initialize']();
		}
		return room;
	}

	/**
	 * Load raw room state from storage for the current or previous tick
	 */
	async loadRoomBlob(name: string, time = this.time) {
		this.checkTime(time, -1);
		return RoomSchema.upgrade(await this.blob.reqBuffer(this.roomKeyForTime(name, time)));
	}

	/**
	 * Save room state to storage for the current or next tick
	 */
	async saveRoom(name: string, time: number, room: RoomSchema.Shape) {
		if (room.name !== name) {
			throw new Error('Room name mismatch');
		}
		await this.saveRoomBlob(name, time, RoomSchema.write(room));
	}

	/**
	 * Save raw room state to storage for the current or next tick
	 */
	async saveRoomBlob(name: string, time: number, blob: Readonly<Uint8Array>) {
		this.checkTime(time, 1);
		await Promise.all([
			this.blob.set(this.roomKeyForTime(name, time), blob),
			getRoomChannel(this, name).publish({ type: 'didUpdate', time }),
		]);
	}

	/**
	 * If a room is going to sleep then the current data should be copied to both sides of the double
	 * buffer to ensure a rollback doesn't overwrite room state.
	 */
	async copyRoomFromPreviousTick(name: string, time: number) {
		await this.blob.copy(this.roomKeyForTime(name, time - 1), this.roomKeyForTime(name, time), { replace: true });
	}

	private checkTime(time: number, delta: number) {
		if (!(time === this.time || time === this.time + delta)) {
			throw new Error(`Invalid time: ${time} [current: ${this.time}]`);
		}
	}

	private roomKeyForTime(name: string, time: number) {
		return `room${time % 2}/${name}`;
	}
}
