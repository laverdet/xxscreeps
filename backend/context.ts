import { readGame } from '~/engine/metadata/game';
import type { GameMessage } from '~/engine/service';
import { readWorld, World } from '~/game/map';
import { getOrSet } from '~/lib/utility';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Mutex } from '~/storage/mutex';
import * as Auth from './auth';
import * as User from '~/engine/metadata/user';

export class BackendContext {
	private readonly providerToUser = new Map<string, string>();
	private readonly userToProvider = new Map<string, string[]>();

	private constructor(
		public readonly blobStorage: BlobStorage,
		public readonly gameChannel: Channel<GameMessage>,
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
		const blobStorage = await BlobStorage.connect();
		const gameChannel = await Channel.connect<GameMessage>('main');
		const world = readWorld(await blobStorage.load('terrain'));
		const game = readGame(await blobStorage.load('game'));
		const gameMutex = await Mutex.connect('game');
		const auth = Auth.read(await blobStorage.load('auth'));
		const context = new BackendContext(blobStorage, gameChannel, world, game.accessibleRooms, gameMutex, auth, game.time);
		return context;
	}

	disconnect() {
		this.blobStorage.disconnect();
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
		return User.read(await this.blobStorage.load(`user/${id}/info`));
	}

	async save() {
		await this.blobStorage.save('auth', Auth.write(this.providerEntries));
	}
}
