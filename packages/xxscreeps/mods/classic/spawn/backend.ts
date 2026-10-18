import type { JSONSchemaType } from 'ajv';
import type { Shard } from 'xxscreeps/engine/db/shard.js';
import type { AnyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { bindRenderer, hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';
import { getShardGameChannel } from 'xxscreeps/engine/db/shard.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { pushIntentsForRoomNextTick, userToIntentRoomsSetKey, userToPresenceRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game, runOneShot } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { ConstructionSite } from 'xxscreeps/mods/classic/construction/construction-site.js';
import { checkCreateConstructionSite } from 'xxscreeps/mods/classic/construction/room.js';
import { renderStore } from 'xxscreeps/mods/classic/resource/backend.js';
import { saveUserFlagBlobForNextTick } from 'xxscreeps/mods/meta/flag/model.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureExtension } from './extension.js';
import * as Spawn from './spawn.js';

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

interface ObjectNameRequest {
	type: string;
	name?: string | null;
}

const objectNameRequestSchema: JSONSchemaType<ObjectNameRequest> = {
	type: 'object',
	properties: {
		type: { type: 'string' },
		name: { type: 'string', nullable: true },
	},
	required: [ 'type' ],
};

hooks.register('route', {
	path: '/api/game/check-unique-object-name',
	method: 'post',

	execute: makeValidatedPayloadRoute(objectNameRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		if (context.request.body.type !== 'spawn') {
			return;
		}
		const rooms = await Promise.all(Fn.map(
			await context.shard.scratch.sMembers(userToIntentRoomsSetKey(userId)),
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
	}),
});

hooks.register('route', {
	path: '/api/game/gen-unique-object-name',
	method: 'post',

	execute: makeValidatedPayloadRoute(objectNameRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		if (context.request.body.type !== 'spawn') {
			return;
		}
		const rooms = await Promise.all(Fn.map(
			await context.shard.scratch.sMembers(userToIntentRoomsSetKey(userId)),
			roomName => context.shard.loadRoom(roomName)));
		let max = 0;
		for (const room of rooms) {
			for (const structure of Fn.concat<AnyStructure | ConstructionSite>([
				room.find(C.FIND_STRUCTURES),
				room.find(C.FIND_CONSTRUCTION_SITES),
			])) {
				if (structure.structureType === 'spawn' && structure['#user'] === userId) {
					const number = Number(/^Spawn(?<count>[0-9]+)$/.exec(structure.name)?.groups?.count);
					if (number > max) {
						max = number;
					}
				}
			}
		}
		return { ok: 1, name: `Spawn${max + 1}` };
	}),
});

interface PlaceSpawnRequest {
	name: string;
	room: string;
	x: number;
	y: number;
}

const placeSpawnBodyRequestSchema: JSONSchemaType<PlaceSpawnRequest> = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		room: { type: 'string' },
		x: { type: 'number' },
		y: { type: 'number' },
	},
	required: [ 'name', 'room', 'x', 'y' ],
};

hooks.register('route', {
	path: '/api/game/place-spawn',
	method: 'post',

	execute: makeValidatedPayloadRoute(placeSpawnBodyRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const { name, room: roomName, x, y } = context.request.body;
		const pos = new RoomPosition(x, y, roomName);

		// Check last spawn time
		const now = Date.now();
		const lastSpawn = await context.shard.data.hGet(User.infoKey(userId), 'lastSpawnTime');
		if (lastSpawn !== null && now < Number(lastSpawn) + config.game.respawnTimeout * 3600 * 1000) {
			throw new Error('Too soon after last respawn');
		}

		// Ensure user has no objects
		const roomNames = await context.shard.scratch.sMembers(userToIntentRoomsSetKey(userId));
		if (roomNames.length !== 0) {
			throw new Error('User has presence');
		}

		// Check room eligibility
		const room = await context.shard.loadRoom(roomName);
		runOneShot(context.backend.world, room, context.shard.time, userId, () => {
			// Check room eligibility
			if (!room.controller || room.controller.reservation || room.controller.owner) {
				throw new Error('Room is owned');
			}
			room['#user'] = room.controller['#user'] = userId;
			room['#level'] = 1;
			if (checkCreateConstructionSite(room, pos, 'spawn', name) !== C.OK) {
				throw new Error('Invalid intent');
			}
		});

		// Send intent to processor
		await pushIntentsForRoomNextTick(context.shard, roomName, userId, {
			local: { placeSpawn: [ [ x, y, name ] ] },
			internal: true,
		});

		// Update last spawn time
		await context.shard.data.hSet(User.infoKey(userId), 'lastSpawnTime', Date.now());
		return { ok: 1 };
	}),
});

/**
 * Removes the user from the world and resolves once they are gone, since the client requests
 * world-status as soon as the map loads. Returns `false` when they have nothing to remove.
 */
export async function respawnUser(shard: Shard, userId: string) {
	const roomNames = await shard.scratch.sMembers(userToPresenceRoomsSetKey(userId));
	if (roomNames.length === 0) {
		return false;
	}
	using disposable = new DisposableStack();
	// A sleeping room wakes for the intents on the next tick, and that tick's completion is
	// published as the tick after
	const time = shard.time + 2;
	const [ effect, removed ] = getShardGameChannel(shard).listenFor(message => message.type === 'tick' && message.time >= time);
	disposable.defer(effect);
	await Promise.all([
		...roomNames.map(roomName => pushIntentsForRoomNextTick(shard, roomName, userId, {
			local: { unspawn: [ [] ] },
			internal: true,
		})),
		saveUserFlagBlobForNextTick(shard, userId, undefined),
	]);
	await removed;
	return true;
}

hooks.register('route', {
	path: '/api/user/respawn',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		if (await respawnUser(context.shard, userId)) {
			return { ok: 1 };
		} else {
			return { error: 'invalid status' };
		}
	},
});
