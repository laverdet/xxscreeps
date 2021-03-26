import type { GameMessage } from 'xxscreeps/engine/service';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import * as RoomSchema from 'xxscreeps/engine/room';
import { connect, Provider } from 'xxscreeps/storage';
import { Channel, Subscription } from 'xxscreeps/storage/channel';

export class Shard {
	public time = -1;
	private readonly gameTickEffect: () => void;

	private constructor(
		public readonly storage: Provider,
		public readonly terrainBlob: Readonly<Uint8Array>,
		private readonly gameChannel: Subscription<GameMessage>,
	) {
		this.gameTickEffect = gameChannel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		});
	}

	static async connect(shard: string) {
		// Connect to shard, load const data
		const provider = await connect(shard);
		const terrainBlob = await provider.persistence.get('terrain');
		const gameChannel = await new Channel<GameMessage>(provider, 'main').subscribe();
		// Create instance (which subscribes to tick notification) and then read current
		const instance = new Shard(provider, terrainBlob, gameChannel);
		const game = GameSchema.read(await provider.persistence.get('game'));
		instance.time = Math.max(game.time, instance.time);
		return instance;
	}

	disconnect() {
		this.gameTickEffect();
		this.gameChannel.disconnect();
		this.storage.disconnect();
	}

	/**
	 * Load room state from storage for the current or previous tick
	 */
	async loadRoom(name: string, time: number) {
		return RoomSchema.read(await this.loadRoomBlob(name, time));
	}

	/**
	 * Load raw room state from storage for the current or previous tick
	 */
	async loadRoomBlob(name: string, time: number) {
		this.checkTime(time, -1);
		return this.storage.persistence.get(this.roomKeyForTime(name, time));
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
		return this.storage.persistence.set(this.roomKeyForTime(name, time), blob);
	}

	/**
	 * If a room is going to sleep then the current data should be copied to both sides of the double
	 * buffer to ensure a rollback doesn't overwrite room state.
	 */
	async copyRoomFromPreviousTick(name: string, time: number) {
		this.checkTime(time, 1);
		return this.storage.persistence.copy(this.roomKeyForTime(name, time - 1), this.roomKeyForTime(name, time));
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
