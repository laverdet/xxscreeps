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
	path: '/game/check-unique-object-name',
	method: 'post',

	async execute(req) {
		if (req.body.type !== 'spawn') {
			return;
		}
		const { userid } = req.locals;
		const user = await loadUser(this.context, userid!);
		const rooms = await Promise.all(Fn.map(user.roomsPresent, room =>
			this.context.shard.loadRoom(room, this.context.shard.time)));
		for (const room of rooms) {
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
});

registerBackendRoute({
	path: '/game/gen-unique-object-name',
	method: 'post',

	async execute(req) {
		if (req.body.type !== 'spawn') {
			return;
		}
		const { userid } = req.locals;
		const user = await loadUser(this.context, userid!);
		const rooms = await Promise.all(Fn.map(user.roomsPresent, room =>
			this.context.shard.loadRoom(room, this.context.shard.time)));
		let max = 0;
		for (const room of rooms) {
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
});

registerBackendRoute({
	path: '/game/place-spawn',
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
			const room = await this.context.shard.loadRoom(pos.roomName, this.context.shard.time);
			Game.runWithState([ room ], this.context.time, () => {
				Game.runAsUser(user.id, () => {
					// Check room eligibility
					if (checkCreateConstructionSite(room, pos, 'spawn') !== C.OK) {
						throw new Error('Invalid intent');
					}
					// Add spawn
					insertObject(room, Spawn.create(pos, userid!, name));
					Controller.claim(room.controller!, user.id);
					user.roomsControlled.add(room.name);
					user.roomsPresent.add(room.name);
					user.roomsVisible.add(room.name);
				});
			});

			// Make room & user active
			const game = GameSchema.read(await this.context.persistence.get('game'));
			game.users.add(user.id);

			// Save
			await Promise.all([
				this.context.persistence.set('game', GameSchema.write(game)),
				saveUser(this.context, user),
				this.context.shard.saveRoom(pos.roomName, this.context.shard.time, room),
			]);
			await new Channel<ServiceMessage>(this.context.storage, 'service').publish({ type: 'gameModified' });
		});
		return { ok: 1 };
	},
});
