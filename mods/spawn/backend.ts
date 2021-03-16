import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import * as Fn from 'xxscreeps/utility/functional';
import * as Controller from 'xxscreeps/mods/controller/processor';
import * as Spawn from './spawn';
import { loadRoom, loadRooms, saveRoom } from 'xxscreeps/backend/model/room';
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
			const room = await loadRoom(this.context, pos.roomName);
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
});
