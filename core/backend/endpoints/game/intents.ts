import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import * as Fn from 'xxscreeps/utility/functional';
import { Endpoint } from 'xxscreeps/backend/endpoint';
import { loadRoom, loadRooms, saveRoom } from 'xxscreeps/backend/model/room';
import { loadUser, saveUser } from 'xxscreeps/backend/model/user';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import * as ControllerIntents from 'xxscreeps/engine/processor/intents/controller';
import * as Spawn from 'xxscreeps/mods/spawn/spawn';
import { insertObject } from 'xxscreeps/game/room/methods';
import { checkCreateConstructionSite } from 'xxscreeps/mods/construction/room';
import { RoomPosition } from 'xxscreeps/game/position';
import { ServiceMessage } from 'xxscreeps/engine/service';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';
import { Channel } from 'xxscreeps/storage/channel';

// TODO: Move this to backend mod
import { create as createInvader } from 'xxscreeps/mods/invader/processor';
import { activateNPC } from 'xxscreeps/mods/npc/processor';

const AddObjectIntentEndpoint: Endpoint = {
	path: '/add-object-intent',
	method: 'post',

	async execute(req) {
		const { userid } = req.locals;
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
		const { userid } = req.locals;
		const user = await loadUser(this.context, userid!);
		for (const room of await loadRooms(this.context, user.roomsPresent)) {
			for (const structure of room.find(C.FIND_STRUCTURES)) {
				if (
					structure.structureType === 'spawn' &&
					structure.owner === userid &&
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
		const { userid } = req.locals;
		const user = await loadUser(this.context, userid!);
		let max = 0;
		for (const room of await loadRooms(this.context, user.roomsPresent)) {
			for (const structure of Fn.concat(
				room.find(C.FIND_STRUCTURES),
				room.find(C.FIND_CONSTRUCTION_SITES),
			)) {
				if (structure.structureType === 'spawn' && structure.owner === userid) {
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
		const { userid } = req.locals;
		const { name, room, x, y } = req.body;
		const pos = new RoomPosition(x, y, room);
		await this.context.gameMutex.scope(async() => {
			// Ensure user has no objects
			const user = await loadUser(this.context, userid!);
			if (user.roomsPresent.size !== 0) {
				throw new Error('User has presence');
			}
			const room = await loadRoom(this.context, pos.roomName);
			Game.runWithState([ room ], this.context.time, () => {
				Game.runAsUser(user.id, () => {
					// Check room eligibility
					if (checkCreateConstructionSite(room, pos, 'spawn') !== C.OK) {
						throw new Error('Invalid intent');
					}
					// Add spawn
					insertObject(room, Spawn.create(pos, userid!, name));
					ControllerIntents.claim(room.controller!, user.id);
					user.roomsControlled.add(room.name);
					user.roomsPresent.add(room.name);
					user.roomsVisible.add(room.name);
				});
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

const CreateInvaderEndpoint: Endpoint = {
	path: '/create-invader',
	method: 'post',

	async execute(req) {
		const { userid } = req.locals;
		const { room: roomName, x, y, size, type } = req.body;
		const pos = new RoomPosition(x, y, roomName);
		if (
			(size !== 'big' && size !== 'small') ||
			![ 'healer', 'melee', 'ranged' ].includes(type)
		) {
			return;
		}

		// Modify room state
		await this.context.gameMutex.scope(async() => {
			const room = await loadRoom(this.context, pos.roomName);
			if (room.controller?.owner !== userid) {
				return;
			}
			activateNPC(room, '2');
			insertObject(room, createInvader(pos, type, size, Game.time + 200));
			await saveRoom(this.context, room);
		});
		return { ok: 1 };
	},
};

export default [ AddObjectIntentEndpoint, CheckUniqueNameEndpoint, CreateInvaderEndpoint, GenNameEndpoint, PlaceSpawnEndpoint ];
