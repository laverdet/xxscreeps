import type { GameMessage } from 'xxscreeps/engine/service';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import * as RoomSchema from 'xxscreeps/engine/room';
import { connectToProvider, BlobProvider, KeyValProvider, PubSubProvider } from 'xxscreeps/storage';
import { Channel, Subscription } from 'xxscreeps/storage/channel';
import config from 'xxscreeps/config';

export class Shard {
	public time = -1;
	private readonly gameTickEffect: () => void;

	private constructor(
		public readonly blob: BlobProvider,
		public readonly data: KeyValProvider,
		public readonly pubsub: PubSubProvider,
		public readonly scratch: KeyValProvider,
		public readonly terrainBlob: Readonly<Uint8Array>,
		private readonly gameChannel: Subscription<GameMessage>,
	) {
		this.gameTickEffect = gameChannel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		});
	}

	static async connect(name: string) {
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
		const terrainBlob = await blob.getBuffer('terrain');
		const gameChannel = await new Channel<GameMessage>(pubsub, 'main').subscribe();
		// Create instance (which subscribes to tick notification) and then read current info
		const instance = new Shard(blob, data, pubsub, scratch, terrainBlob, gameChannel);
		const game = GameSchema.read(await blob.getBuffer('game'));
		instance.time = Math.max(game.time, instance.time);
		return instance;
	}

	disconnect() {
		this.gameTickEffect();
		this.gameChannel.disconnect();
		this.blob.disconnect();
		this.data.disconnect();
		this.pubsub.disconnect();
		this.scratch.disconnect();
	}

	/**
	 * Load room state from storage for the current or previous tick
	 */
	async loadRoom(name: string, time = this.time) {
		return RoomSchema.read(await this.loadRoomBlob(name, time));
	}

	/**
	 * Load raw room state from storage for the current or previous tick
	 */
	async loadRoomBlob(name: string, time = this.time) {
		this.checkTime(time, -1);
		return this.blob.getBuffer(this.roomKeyForTime(name, time));
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
		return this.blob.set(this.roomKeyForTime(name, time), blob);
	}

	/**
	 * If a room is going to sleep then the current data should be copied to both sides of the double
	 * buffer to ensure a rollback doesn't overwrite room state.
	 */
	async copyRoomFromPreviousTick(name: string, time: number) {
		this.checkTime(time, 1);
		return this.blob.copy(this.roomKeyForTime(name, time - 1), this.roomKeyForTime(name, time));
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
