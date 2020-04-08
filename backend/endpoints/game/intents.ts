import * as C from '~/game/constants';
import { runAsUser } from '~/game/game';
import { Endpoint } from '~/backend/endpoint';
import { loadRoom, loadRooms, saveRoom } from '~/backend/model/room';
import { loadUser, saveUser } from '~/backend/model/user';
import * as GameSchema from '~/engine/metadata/game';
import * as ControllerIntents from '~/engine/processor/intents/controller';
import * as RoomIntents from '~/engine/processor/intents/room';
import * as SpawnIntents from '~/engine/processor/intents/spawn';
import * as Room from '~/game/room';
import { RoomPosition } from '~/game/position';
import { concatInPlace } from '~/lib/utility';
import { ServiceMessage } from '~/engine/service';
import { RunnerUserMessage } from '~/engine/service/runner';
import { Channel } from '~/storage/channel';

const AddObjectIntentEndpoint: Endpoint = {
	path: '/add-object-intent',
	method: 'post',

	execute(req) {
		const { userid } = req;
		const { room, name, intent: { id } } = req.body;
		if (typeof room !== 'string' || typeof name !== 'string' || typeof id !== 'string') {
			throw new TypeError('Invalid parameters');
		}
		Channel.publish<RunnerUserMessage>(
			`user/${userid}/runner`, { type: 'intent', intent: name, id, room });
		return { ok: 1 };
	},
};

const CheckUniqueNameEndpoint: Endpoint = {
	path: '/check-unique-object-name',
	method: 'post',

	async execute(req) {
		if (req.body.type !== 'spawn') {
			return;
		}
		const { userid } = req;
		const user = await loadUser(this.context, userid!);
		for (const room of await loadRooms(this.context, user.roomsPresent)) {
			for (const structure of room.find(C.FIND_STRUCTURES)) {
				if (
					structure.structureType === 'spawn' &&
					structure._owner === userid &&
					structure.name === req.body.name
				) {
					return { error: 'exists' };
				}
			}
		}
		return { ok: 1 };
	},
};

const GenNameEndpoint: Endpoint = {
	path: '/gen-unique-object-name',
	method: 'post',

	async execute(req) {
		if (req.body.type !== 'spawn') {
			return;
		}
		const { userid } = req;
		const user = await loadUser(this.context, userid!);
		let max = 0;
		for (const room of await loadRooms(this.context, user.roomsPresent)) {
			for (const structure of concatInPlace(
				room.find(C.FIND_STRUCTURES),
				room.find(C.FIND_CONSTRUCTION_SITES),
			)) {
				if (structure.structureType === 'spawn' && structure._owner === userid) {
					const number = Number(/^Spawn(?<count>[0-9]+)$/.exec(structure.name)?.groups?.number);
					if (number > max) {
						max = number;
					}
				}
			}
		}
		return { ok: 1, name: `Spawn${max + 1}` };
	},
};

const PlaceSpawnEndpoint: Endpoint = {
	path: '/place-spawn',
	method: 'post',

	async execute(req) {
		const { userid } = req;
		const { name, room, x, y } = req.body;
		const pos = new RoomPosition(x, y, room);
		await this.context.gameMutex.scope(async() => {
			// Ensure user has no objects
			const user = await loadUser(this.context, userid!);
			if (user.roomsPresent.size !== 0) {
				throw new Error('User has presence');
			}
			const room = await loadRoom(this.context, pos.roomName);
			runAsUser(user.id, this.context.time, () => {
				// Check room eligibility
				if (Room.checkCreateConstructionSite(room, pos, 'spawn') !== C.OK) {
					throw new Error('Invalid intent');
				}
				// Add spawn
				RoomIntents.insertObject(room, SpawnIntents.create(pos, userid!, name));
				ControllerIntents.claim(room.controller!, user.id);
				user.roomsControlled.add(room.name);
				user.roomsPresent.add(room.name);
				user.roomsVisible.add(room.name);
			});

			// Make room & user active
			const game = GameSchema.read(await this.context.blobStorage.load('game'));
			game.activeRooms.add(pos.roomName);
			game.users.add(user.id);

			// Save
			await Promise.all([
				this.context.blobStorage.save('game', GameSchema.write(game)),
				saveUser(this.context, user),
				saveRoom(this.context, room),
			]);
			Channel.publish<ServiceMessage>('service', { type: 'gameModified' });
		});
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint, CheckUniqueNameEndpoint, GenNameEndpoint, PlaceSpawnEndpoint ];
