import * as C from '~/game/constants';
import { runAsUser } from '~/game/game';
import { Endpoint } from '~/backend/endpoint';
import { loadRoom, loadRooms, saveRoom } from '~/backend/model/room';
import { loadUser, saveUser } from '~/backend/model/user';
import * as GameSchema from '~/engine/metadata/game';
import * as ControllerIntents from '~/engine/processor/intents/controller';
import * as CreepIntents from '~/engine/processor/intents/creep';
import * as SpawnIntents from '~/engine/processor/intents/spawn';
import * as Room from '~/game/room';
import { RoomPosition } from '~/game/position';
import type { PartType } from '~/game/objects/creep';
import { concatInPlace, accumulate } from '~/lib/utility';
import { ServiceMessage } from '~/engine/service';
import { getRunnerUserChannel } from '~/engine/runner/channel';
import { Channel } from '~/storage/channel';

const AddObjectIntentEndpoint: Endpoint = {
	path: '/add-object-intent',
	method: 'post',

	async execute(req) {
		const { userid } = req;
		const { room, name, intent: { id } } = req.body;
		if (typeof room !== 'string' || typeof name !== 'string' || typeof id !== 'string') {
			throw new TypeError('Invalid parameters');
		}
		await getRunnerUserChannel(this.context.shard, userid!)
			.publish({ type: 'intent', intent: { receiver: id, intent: name, params: true } });
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
				Room.insertObject(room, SpawnIntents.create(pos, userid!, name));
				ControllerIntents.claim(room.controller!, user.id);
				user.roomsControlled.add(room.name);
				user.roomsPresent.add(room.name);
				user.roomsVisible.add(room.name);
			});

			// Make room & user active
			const game = GameSchema.read(await this.context.persistence.get('game'));
			game.activeRooms.add(pos.roomName);
			game.users.add(user.id);

			// Save
			await Promise.all([
				this.context.persistence.set('game', GameSchema.write(game)),
				saveUser(this.context, user),
				saveRoom(this.context, room),
			]);
			await new Channel<ServiceMessage>(this.context.storage, 'service').publish({ type: 'gameModified' });
		});
		return { ok: 1 };
	},
};

function createInvaderBody(parts: { [Type in PartType]?: number }) {
	const size = accumulate(Object.values(parts) as number[]);
	return [
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		...Array(parts[C.TOUGH] ?? 0).fill(C.TOUGH),
		...Array(size - 1).fill(C.MOVE),
		...Object.entries(parts).map(([ type, count ]) => {
			if (type === C.TOUGH) {
				return [];
			} else {
				return Array(count).fill(type);
			}
		}).flat(),
		C.MOVE,
	];
}

const CreateInvaderEndpoint: Endpoint = {
	path: '/create-invader',
	method: 'post',

	async execute(req) {
		const { userid, body: { room: roomName, x, y, size, type } } = req;
		const pos = new RoomPosition(x, y, roomName);
		const bodies = {
			bigHealer: () => createInvaderBody({ [C.HEAL]: 25 }),
			bigRanged: () => createInvaderBody({ [C.TOUGH]: 6, [C.RANGED_ATTACK]: 18, [C.WORK]: 1 }),
			bigMelee: () => createInvaderBody({ [C.TOUGH]: 16, [C.RANGED_ATTACK]: 3, [C.WORK]: 4, [C.ATTACK]: 2 }),
			smallHealer: () => createInvaderBody({ [C.HEAL]: 5 }),
			smallRanged: () => createInvaderBody({ [C.TOUGH]: 2, [C.RANGED_ATTACK]: 3 }),
			smallMelee: () => createInvaderBody({ [C.TOUGH]: 2, [C.RANGED_ATTACK]: 1, [C.WORK]: 1, [C.ATTACK]: 1 }),
		};
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const body = bodies[`${size}${type}` as keyof typeof bodies]?.();
		if (body === undefined) {
			return;
		}

		// Modify room state
		await this.context.gameMutex.scope(async() => {
			const room = await loadRoom(this.context, pos.roomName);
			if (room.controller?._owner !== userid) {
				return;
			}
			room._npcs.add('2');
			const creep = CreepIntents.create(body, pos, `Invader_${Math.floor(Math.random() * 1000)}`, '2');
			creep._ageTime = this.context.time + 200;
			Room.insertObject(room, creep);
			await saveRoom(this.context, room);
		});
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint, CheckUniqueNameEndpoint, CreateInvaderEndpoint, GenNameEndpoint, PlaceSpawnEndpoint ];
