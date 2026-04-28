import type { Subscription } from './channel.js';
import type { Database } from './database.js';
import type { KeyValProvider, PubSubProvider } from './storage/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import config from 'xxscreeps/config/index.js';
import * as RoomSchema from 'xxscreeps/engine/db/room.js';
import { connectToProvider } from 'xxscreeps/engine/db/storage/index.js';
import { World } from 'xxscreeps/game/map.js';
import { acquire } from 'xxscreeps/utility/async.js';
import { getRoomChannel } from '../processor/model.js';
import { Channel } from './channel.js';

type Message = { type: 'tick'; time: number } | { type: null };

export class Shard {
	time = -1;
	readonly db;
	readonly name;
	readonly data;
	readonly pubsub;
	readonly scratch;
	readonly channel;
	private readonly disposable: DisposableStack;

	private constructor(
		disposable: DisposableStack,
		db: Database,
		name: string,
		data: KeyValProvider,
		pubsub: PubSubProvider,
		scratch: KeyValProvider,
		channel: Subscription<Message>,
	) {
		this.disposable = disposable;
		this.db = db;
		this.name = name;
		this.data = data;
		this.pubsub = pubsub;
		this.scratch = scratch;
		this.channel = channel;
		disposable.defer(channel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		}));
	}

	static async connect(db: Database, name: string) {
		// Connect to shard, load const data
		const shard = config.shards.find(shard => shard.name === name);
		if (!shard) {
			throw new Error(`Unknown shard: ${name}`);
		}
		return this.connectWith(db, shard);
	}

	static async connectWith(db: Database, info: {
		name: string;
		data: string;
		pubsub: string;
		scratch: string;
	}) {
		using disposable = new DisposableStack();
		const [ effect, [ data, pubsub, scratch ] ] = await acquire(
			connectToProvider(info.data, 'keyval'),
			connectToProvider(info.pubsub, 'pubsub'),
			connectToProvider(info.scratch, 'keyval'),
		);
		disposable.defer(effect);
		const channel = disposable.adopt(
			await new Channel<Message>(pubsub, 'channel/game').subscribe(),
			subscription => subscription.disconnect(),
		);
		// Create instance (which subscribes to tick notification) and then read current info
		const time = Number(await data.get('time'));
		const instance = new Shard(disposable.move(), db, info.name, data, pubsub, scratch, channel);
		instance.time = Math.max(time, instance.time);
		return instance;
	}

	[Symbol.dispose]() {
		this.disposable.dispose();
	}

	disconnect() {
		this.disposable.dispose();
	}

	save() {
		return Promise.all([ this.data.save(), this.scratch.save() ]);
	}

	/**
	 * Load and parse shard terrain data together with the active-rooms set so
	 * `World.map.getRoomStatus()` can distinguish closed rooms from normal ones.
	 */
	async loadWorld() {
		const [ terrainBlob, rooms ] = await Promise.all([
			this.data.req('terrain', { blob: true }),
			this.data.smembers('rooms'),
		]);
		return new World(this.name, terrainBlob, new Set(rooms));
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
	async saveRoom(name: string, time: number, room: Room) {
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
