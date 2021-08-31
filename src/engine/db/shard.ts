import type { KeyValProvider, PubSubProvider } from './storage';
import type { Database } from './database';
import type { Effect } from 'xxscreeps/utility/types';
import type { Subscription } from './channel';
import * as RoomSchema from 'xxscreeps/engine/db/room';
import { connectToProvider } from 'xxscreeps/engine/db/storage';
import { Channel } from './channel';
import { World } from 'xxscreeps/game/map';
import config from 'xxscreeps/config';
import { getRoomChannel } from '../processor/model';
import { acquire } from 'xxscreeps/utility/async';

type Message = { type: 'tick'; time: number } | { type: null };

export class Shard {
	time = -1;
	private readonly gameTickEffect: Effect;

	private constructor(
		private readonly effect: Effect,
		public readonly db: Database,
		public readonly name: string,
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
		return this.connectWith(db, shard);
	}

	static async connectWith(db: Database, info: {
		name: string;
		data: string;
		pubsub: string;
		scratch: string;
	}) {
		const [ effect, [ data, pubsub, scratch ] ] = await acquire(
			connectToProvider(info.data, 'keyval'),
			connectToProvider(info.pubsub, 'pubsub'),
			connectToProvider(info.scratch, 'keyval'),
		);
		const channel = await new Channel<Message>(pubsub, 'channel/game').subscribe();
		// Create instance (which subscribes to tick notification) and then read current info
		const instance = new Shard(effect, db, info.name, data, pubsub, scratch, channel);
		const time = Number(await data.get('time'));
		instance.time = Math.max(time, instance.time);
		return instance;
	}

	disconnect() {
		this.gameTickEffect();
		this.channel.disconnect();
		this.effect();
	}

	save() {
		return Promise.all([ this.data.save(), this.scratch.save() ]);
	}

	/**
	 * Load and parse shard terrain data
	 */
	async loadWorld() {
		return new World(this.name, await this.data.req('terrain', { blob: true }));
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
		await this.checkTime(time, -1);
		return RoomSchema.upgrade(await this.data.req(this.roomKeyForTime(name, time), { blob: true }));
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
		await this.checkTime(time, 1);
		await Promise.all([
			this.data.set(this.roomKeyForTime(name, time), blob),
			getRoomChannel(this, name).publish({ type: 'didUpdate', time }),
		]);
	}

	/**
	 * If a room is going to sleep then the current data should be copied to both sides of the double
	 * buffer to ensure a rollback doesn't overwrite room state.
	 */
	async copyRoomFromPreviousTick(name: string, time: number) {
		await this.data.copy(this.roomKeyForTime(name, time - 1), this.roomKeyForTime(name, time));
	}

	private async checkTime(time: number, delta: number) {
		if (!(time === this.time || time === this.time + delta)) {
			this.time = Math.max(this.time, Number(await this.data.get('time')));
			if (!(time === this.time || time === this.time + delta)) {
				throw new Error(`Invalid time: ${time} [current: ${this.time}]`);
			}
		}
	}

	private roomKeyForTime(name: string, time: number) {
		return `room${time % 2}/${name}`;
	}
}
