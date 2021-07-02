import config from 'xxscreeps/config';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/db/user';
import * as Spawn from './spawn';
import { Game, runOneShot } from 'xxscreeps/game';
import { getRoomChannel, pushIntentsForRoomNextTick, userToIntentRoomsSetKey, userToPresenceRoomsSetKey } from 'xxscreeps/engine/processor/model';
import { RoomPosition } from 'xxscreeps/game/position';
import { checkCreateConstructionSite } from 'xxscreeps/mods/construction/room';
import { bindRenderer, hooks } from 'xxscreeps/backend';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { saveUserFlagBlobForNextTick } from 'xxscreeps/mods/flag/model';
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

hooks.register('route', {
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
			await context.shard.scratch.smembers(userToIntentRoomsSetKey(userId)),
			roomName => context.shard.loadRoom(roomName)));
		for (const room of rooms) {
			for (const structure of room.find(C.FIND_STRUCTURES)) {
				if (
					structure.structureType === 'spawn' &&
					structure['#user'] === userId &&
					structure.name === context.request.body.name
				) {
					return { error: 'exists' };
				}
			}
		}
		return { ok: 1 };
	},
});

hooks.register('route', {
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
			await context.shard.scratch.smembers(userToIntentRoomsSetKey(userId)),
			roomName => context.shard.loadRoom(roomName)));
		let max = 0;
		for (const room of rooms) {
			for (const structure of Fn.concat(
				room.find(C.FIND_STRUCTURES),
				room.find(C.FIND_CONSTRUCTION_SITES),
			)) {
				if (structure.structureType === 'spawn' && structure['#user'] === userId) {
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

hooks.register('route', {
	path: '/api/game/place-spawn',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { name, room: roomName, x, y } = context.request.body;
		const pos = new RoomPosition(x, y, roomName);

		// Check last spawn time
		const now = Date.now();
		const lastSpawn = await context.shard.data.hget(User.infoKey(userId), 'lastSpawnTime');
		if (lastSpawn !== null && now < Number(lastSpawn) + config.game.respawnTimeout * 3600 * 1000) {
			throw new Error('Too soon after last respawn');
		}

		// Insert delay to workaround client bugs [see room socket]
		await getRoomChannel(context.shard, roomName).publish({ type: 'willSpawn' });

		// Ensure user has no objects
		const roomNames = await context.shard.scratch.smembers(userToIntentRoomsSetKey(userId));
		if (roomNames.length !== 0) {
			throw new Error('User has presence');
		}

		// Check room eligibility
		const room = await context.shard.loadRoom(roomName);
		runOneShot(context.backend.world, room, context.shard.time, userId, () => {
			// Check room eligibility
			if (!room.controller || room.controller.reservation || room.controller.my === false) {
				throw new Error('Room is owned');
			}
			room['#user'] = userId;
			room['#level'] = 1;
			if (checkCreateConstructionSite(room, pos, 'spawn', name) !== C.OK) {
				throw new Error('Invalid intent');
			}
		});

		// Send intent to processor
		await pushIntentsForRoomNextTick(context.shard, roomName, userId, {
			local: { placeSpawn: [ [ x, y, name ] ] },
			object: {},
			internal: true,
		});

		// Update last spawn time
		await context.shard.data.hset(User.infoKey(userId), 'lastSpawnTime', Date.now());
		return { ok: 1 };
	},
});

hooks.register('route', {
	path: '/api/user/respawn',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const roomNames = await context.shard.scratch.smembers(userToPresenceRoomsSetKey(userId));
		if (roomNames.length === 0) {
			throw new Error('Invalid status');
		}
		await Promise.all(roomNames.map(roomName => pushIntentsForRoomNextTick(context.shard, roomName, userId, {
			local: { unspawn: [ [] ] },
			object: {},
			internal: true,
		})));
		await saveUserFlagBlobForNextTick(context.shard, userId, undefined);
		return { ok: 1 };
	},
});
