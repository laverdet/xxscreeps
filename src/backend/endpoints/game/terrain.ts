import type { World } from 'xxscreeps/game/map';
import * as Fn from 'xxscreeps/utility/functional';
import { hooks } from 'xxscreeps/backend';

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
	const terrain = world.map.getRoomTerrain(roomName);
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

hooks.register('route', {
	path: '/api/game/room-terrain',

	execute(context) {
		const roomName = `${context.query.room}`;
		const terrain = getTerrainPayload(context.backend.world, roomName);
		if (terrain) {
			context.set('Cache-Control', 'public,max-age=31536000,immutable');
			return { ok: 1, terrain };
		}
	},
});

hooks.register('route', {
	path: '/api/game/rooms',
	method: 'post',

	execute(context) {
		context.set('Cache-Control', 'public,max-age=31536000,immutable');
		return {
			ok: 1,
			rooms: [ ...Fn.filter(Fn.map(
				context.request.body.rooms,
				roomQuery => getTerrainPayload(context.backend.world, `${roomQuery}`),
			)) ],
		};
	},
});
