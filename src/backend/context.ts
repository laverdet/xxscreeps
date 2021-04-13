import * as GameSchema from 'xxscreeps/engine/metadata/game';
import { Shard } from 'xxscreeps/engine/model/shard';
import type { GameMessage } from 'xxscreeps/engine/service';
import { readWorld, World } from 'xxscreeps/game/map';
import { Channel, Subscription } from 'xxscreeps/storage/channel';
import { Mutex } from 'xxscreeps/storage/mutex';
import { Authentication } from './auth/model';
import * as User from 'xxscreeps/engine/metadata/user';

export class BackendContext {
	private constructor(
		public readonly shard: Shard,
		public readonly gameChannel: Subscription<GameMessage>,
		public readonly world: World,
		public readonly accessibleRooms: Set<string>,
		public readonly gameMutex: Mutex,
		public readonly auth: Authentication,
		public time: number,
	) {
		// Keep current time up to date
		gameChannel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		});
	}

	static async connect() {
		// Connect to services
		const shard = await Shard.connect('shard0');
		const gameChannel = await new Channel<GameMessage>(shard.pubsub, 'main').subscribe();
		const world = readWorld(await shard.blob.getBuffer('terrain'));
		const game = GameSchema.read(await shard.blob.getBuffer('game'));
		const gameMutex = await Mutex.connect('game', shard.scratch, shard.pubsub);
		const auth = await Authentication.connect(shard.blob);
		const context = new BackendContext(shard, gameChannel, world, new Set(game.rooms.keys()), gameMutex, auth, game.time);
		return context;
	}

	async disconnect() {
		this.shard.disconnect();
		this.gameChannel.disconnect();
		await this.gameMutex.disconnect();
	}

	async loadUser(id: string) {
		return User.read(await this.shard.blob.getBuffer(`user/${id}/info`));
	}
}
