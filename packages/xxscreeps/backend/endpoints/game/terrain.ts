import type { World } from 'xxscreeps/game/map.js';
import makeEtag from 'etag';
import { hooks } from 'xxscreeps/backend/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';

const cache = new Map<string, {
	_id: string;
	room: string;
	terrain: string;
	type: 'terrain';
}>();

/** Evict a single room from the terrain payload cache. Called from the
 * backend's invalidation subscriber on a per-room signal. */
export function evictTerrainCacheEntry(roomName: string) {
	cache.delete(roomName);
}

/** Drop every cached terrain payload. Called when the world terrain blob
 * itself has changed (import-world, remove-room). */
export function clearTerrainCache() {
	cache.clear();
}

function getTerrainPayload(world: World, roomName: string) {
	const cached = cache.get(roomName);
	if (cached) {
		return cached;
	}
	const terrain = world.map.getRoomTerrain(roomName);

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
			// Force revalidation; ETag keeps the unchanged case at 304.
			context.set('Cache-Control', 'no-cache');
			context.set('ETag', makeEtag(terrain.terrain));
			return { ok: 1, terrain: [ terrain ] };
		}
	},
});

hooks.register('route', {
	path: '/api/game/rooms',
	method: 'post',

	execute(context) {
		return {
			ok: 1,
			rooms: Fn.pipe(
				context.request.body.rooms,
				$$ => Fn.map($$, roomQuery => getTerrainPayload(context.backend.world, `${roomQuery}`)),
				$$ => Fn.filter($$),
				$$ => [ ...$$ ]),
		};
	},
});
