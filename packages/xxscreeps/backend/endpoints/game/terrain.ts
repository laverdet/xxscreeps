import type { JSONSchemaType } from 'ajv';
import type { World } from 'xxscreeps/game/map.js';
import makeEtag from 'etag';
import { hooks, makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';

const cache = new Map<string, {
	_id: string;
	room: string;
	terrain: string;
	type: 'terrain';
}>();

function getTerrainPayload(world: World, roomName: string) {
	const cached = cache.get(roomName);
	if (cached) {
		return cached;
	}
	const terrain = world.map.getRoomTerrain(roomName, true);
	if (!terrain) {
		return;
	}
	let terrainString = '';
	for (let yy = 0; yy < 50; ++yy) {
		for (let xx = 0; xx < 50; ++xx) {
			terrainString += terrain.get(xx, yy);
		}
	}
	const payload = {
		_id: roomName,
		room: roomName,
		terrain: terrainString,
		type: 'terrain' as const,
	};
	cache.set(roomName, payload);
	return payload;
}

interface RoomTerrainRequest {
	room: string;
}

const roomTerrainRequestSchema: JSONSchemaType<RoomTerrainRequest> = {
	type: 'object',
	properties: {
		room: { type: 'string' },
	},
	required: [ 'room' ],
};

hooks.register('route', {
	path: '/api/game/room-terrain',

	execute: makeValidatedQueryRoute(roomTerrainRequestSchema, context => {
		const terrain = getTerrainPayload(context.backend.world, context.request.query.room);
		if (terrain) {
			context.set('ETag', makeEtag(terrain.terrain));
			return { ok: 1, terrain: [ terrain ] };
		}
	}),
});

interface RoomsRequest {
	rooms: string[];
}

const roomsRequestSchema: JSONSchemaType<RoomsRequest> = {
	type: 'object',
	properties: {
		rooms: { type: 'array', items: { type: 'string' } },
	},
	required: [ 'rooms' ],
};

hooks.register('route', {
	path: '/api/game/rooms',
	method: 'post',

	execute: makeValidatedPayloadRoute(roomsRequestSchema, context => ({
		ok: 1,
		rooms: Fn.pipe(
			context.request.body.rooms,
			$$ => Fn.map($$, roomQuery => getTerrainPayload(context.backend.world, roomQuery)),
			$$ => Fn.filter($$),
			$$ => [ ...$$ ]),
	})),
});
