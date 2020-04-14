import * as GameSchema from '~/engine/metadata/game';
import { Shard } from '~/engine/model/shard';
import type { GameMessage } from '~/engine/service';
import { readWorld, World } from '~/game/map';
import { getOrSet } from '~/lib/utility';
import * as Storage from '~/storage';
import { Channel, Subscription } from '~/storage/channel';
import { Mutex } from '~/storage/mutex';
import * as Auth from './auth';
import * as User from '~/engine/metadata/user';

export class BackendContext {
	private readonly providerToUser = new Map<string, string>();
	private readonly userToProvider = new Map<string, string[]>();

	private constructor(
		public readonly shard: Shard,
		public readonly storage: Storage.Provider,
		public readonly persistence: Storage.PersistenceProvider,
		public readonly gameChannel: Subscription<GameMessage>,
		public readonly world: World,
		public readonly accessibleRooms: Set<string>,
		public readonly gameMutex: Mutex,
		private readonly providerEntries: Auth.Shape,
		public time: number,
	) {
		// Keep current time up to date
		gameChannel.listen(message => {
			if (message.type === 'tick') {
				this.time = message.time;
			}
		});
		// Index provider entries
		for (const entry of providerEntries) {
			this.providerToUser.set(entry.key, entry.user);
			getOrSet(this.userToProvider, entry.user, () => []).push(entry.key);
		}
	}

	static async connect() {
		// Connect to services
		const shard = await Shard.connect('shard0');
		const storage = await Storage.connect('shard0');
		const { persistence } = storage;
		const gameChannel = await new Channel<GameMessage>(storage, 'main').subscribe();
		const world = readWorld(await persistence.get('terrain'));
		const game = GameSchema.read(await persistence.get('game'));
		const gameMutex = await Mutex.connect(storage, 'game');
		const auth = Auth.read(await persistence.get('auth'));
		const context = new BackendContext(shard, storage, storage.persistence, gameChannel, world, game.accessibleRooms, gameMutex, auth, game.time);
		return context;
	}

	disconnect() {
		this.storage.disconnect();
		this.gameChannel.disconnect();
		this.gameMutex.disconnect();
	}

	associateUser(providerKey: string, id: string) {
		if (this.providerToUser.has(providerKey)) {
			throw new Error('Existing provider key already exists');
		}
		this.providerToUser.set(providerKey, id);
		getOrSet(this.userToProvider, id, () => []).push(providerKey);
		this.providerEntries.push({ key: providerKey, user: id });
	}

	getProvidersForUser(id: string) {
		return this.userToProvider.get(id)!;
	}

	lookupUserByProvider(providerKey: string) {
		return this.providerToUser.get(providerKey);
	}

	async loadUser(id: string) {
		return User.read(await this.storage.persistence.get(`user/${id}/info`));
	}

	async save() {
		await this.storage.persistence.set('auth', Auth.write(this.providerEntries));
	}
}
