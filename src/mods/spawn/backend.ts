import type { Creep } from 'xxscreeps/mods/creep/creep';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import * as Fn from 'xxscreeps/utility/functional';
import * as Controller from 'xxscreeps/mods/controller/processor';
import * as Spawn from './spawn';
import { loadUser, saveUser } from 'xxscreeps/backend/model/user';
import { insertObject } from 'xxscreeps/game/room/methods';
import { RoomPosition } from 'xxscreeps/game/position';
import { ServiceMessage } from 'xxscreeps/engine/service';
import { Channel } from 'xxscreeps/storage/channel';
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
			name: Game.getObjectById<Creep>(spawn.spawning.creep)?.name,
			directions: spawn.spawning.directions,
			needTime: spawn.spawning.needTime,
			spawnTime: spawn.spawning[Spawn.SpawnTime],
		},
	},
}));

registerBackendRoute({
	path: '/api/game/check-unique-object-name',
	method: 'post',

	async execute(context) {
		if (context.request.body.type !== 'spawn') {
			return;
		}
		const { userId } = context.state;
		const user = await loadUser(context.backend, userId!);
		const rooms = await Promise.all(Fn.map(user.roomsPresent, room =>
			context.shard.loadRoom(room)));
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
		if (context.request.body.type !== 'spawn') {
			return;
		}
		const { userId } = context.state;
		const user = await loadUser(context.backend, userId!);
		const rooms = await Promise.all(Fn.map(user.roomsPresent, room =>
			context.shard.loadRoom(room)));
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
		const { name, room, x, y } = context.request.body;
		const pos = new RoomPosition(x, y, room);
		await context.backend.gameMutex.scope(async() => {
			// Ensure user has no objects
			const user = await loadUser(context.backend, userId!);
			if (user.roomsPresent.size !== 0) {
				throw new Error('User has presence');
			}
			const room = await context.shard.loadRoom(pos.roomName);
			Game.runWithState([ room ], context.shard.time, () => {
				Game.runAsUser(user.id, () => {
					// Check room eligibility
					if (checkCreateConstructionSite(room, pos, 'spawn') !== C.OK) {
						throw new Error('Invalid intent');
					}
					// Add spawn
					insertObject(room, Spawn.create(pos, userId!, name));
					Controller.claim(room.controller!, user.id);
					user.roomsControlled.add(room.name);
					user.roomsPresent.add(room.name);
					user.roomsVisible.add(room.name);
				});
			});

			// Make room & user active
			const game = GameSchema.read(await context.shard.storage.blob.get('game'));
			game.users.add(user.id);

			// Save
			await Promise.all([
				context.shard.storage.blob.set('game', GameSchema.write(game)),
				saveUser(context.backend, user),
				context.backend.shard.saveRoom(pos.roomName, context.shard.time, room),
			]);
			await new Channel<ServiceMessage>(context.backend.storage, 'service').publish({ type: 'gameModified' });
		});
		return { ok: 1 };
	},
});
