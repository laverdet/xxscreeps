import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as Controller from 'xxscreeps/mods/controller/processor';
import * as Spawn from './spawn';
import { Game, GameState, runAsUser, runWithState } from 'xxscreeps/game';
import { forceRoomProcess, userToRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { FlushObjects, InsertObject } from 'xxscreeps/game/room';
import { RoomPosition } from 'xxscreeps/game/position';
import { checkCreateConstructionSite } from 'xxscreeps/mods/construction/room';
import { bindRenderer, registerBackendRoute } from 'xxscreeps/backend';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureExtension } from './extension';

bindRenderer(StructureExtension, (extension, next) => ({
	...next(),
	...renderStore(extension.store),
}));

bindRenderer(Spawn.StructureSpawn, (spawn, next) => ({
	...next(),
	...renderStore(spawn.store),
	name: spawn.name,
	...spawn.spawning && {
		spawning: {
			name: spawn.spawning.name,
			directions: spawn.spawning.directions,
			needTime: spawn.spawning.needTime,
			spawnTime: Game.time + spawn.spawning.remainingTime,
		},
	},
}));

registerBackendRoute({
	path: '/api/game/check-unique-object-name',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		if (context.request.body.type !== 'spawn') {
			return;
		}
		const rooms = await Promise.all(Fn.map(
			await context.shard.scratch.smembers(userToRoomsSetKey(userId)),
			roomName => context.shard.loadRoom(roomName)));
		for (const room of rooms) {
			for (const structure of room.find(C.FIND_STRUCTURES)) {
				if (
					structure.structureType === 'spawn' &&
					structure.owner === userId &&
					structure.name === context.request.body.name
				) {
					return { error: 'exists' };
				}
			}
		}
		return { ok: 1 };
	},
});

registerBackendRoute({
	path: '/api/game/gen-unique-object-name',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		if (context.request.body.type !== 'spawn') {
			return;
		}
		const rooms = await Promise.all(Fn.map(
			await context.shard.scratch.smembers(userToRoomsSetKey(userId)),
			roomName => context.shard.loadRoom(roomName)));
		let max = 0;
		for (const room of rooms) {
			for (const structure of Fn.concat(
				room.find(C.FIND_STRUCTURES),
				room.find(C.FIND_CONSTRUCTION_SITES),
			)) {
				if (structure.structureType === 'spawn' && structure.owner === userId) {
					const number = Number(/^Spawn(?<count>[0-9]+)$/.exec(structure.name)?.groups?.number);
					if (number > max) {
						max = number;
					}
				}
			}
		}
		return { ok: 1, name: `Spawn${max + 1}` };
	},
});

registerBackendRoute({
	path: '/api/game/place-spawn',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { name, room: roomName, x, y } = context.request.body;
		const pos = new RoomPosition(x, y, roomName);
		await context.backend.gameMutex.scope(async() => {
			// Ensure user has no objects
			const roomNames = await context.shard.scratch.smembers(userToRoomsSetKey(userId));
			if (roomNames.length !== 0) {
				throw new Error('User has presence');
			}
			const room = await context.shard.loadRoom(roomName);
			runWithState(new GameState(context.backend.world, context.shard.time, [ room ]), () => {
				runAsUser(userId, () => {
					// Check room eligibility
					if (checkCreateConstructionSite(room, pos, 'spawn') !== C.OK) {
						throw new Error('Invalid intent');
					}
					// Add spawn
					room[InsertObject](Spawn.create(pos, userId, name));
					room[FlushObjects]();
					Controller.claim(room.controller!, userId);
				});
			});

			// Save
			await Promise.all([
				forceRoomProcess(context.shard, roomName),
				context.backend.shard.saveRoom(roomName, context.shard.time, room),
				context.backend.shard.data.sadd('users', [ userId ]),
				context.backend.shard.scratch.sadd('users', [ userId ]),
			]);
		});
		return { ok: 1 };
	},
});
