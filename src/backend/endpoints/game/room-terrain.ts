import type { Endpoint } from 'xxscreeps/backend';

const cache = new Map<string, string>();
export const RoomTerrainEndpoint: Endpoint = {
	path: '/api/game/room-terrain',

	execute(context) {
		const room = `${context.query.room}`;
		let terrainString = cache.get(room);
		if (terrainString === undefined) {
			const terrain = context.backend.world.map.getRoomTerrain(room);
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (terrain) {
				terrainString = '';
				for (let yy = 0; yy < 50; ++yy) {
					for (let xx = 0; xx < 50; ++xx) {
						terrainString += terrain.get(xx, yy);
					}
				}
				cache.set(room, terrainString);
			}
		}
		if (terrainString !== undefined) {
			context.set('Cache-Control', 'public,max-age=31536000,immutable');
			return {
				ok: 1,
				terrain: [ {
					_id: context.query.room,
					room: context.query.room,
					terrain: terrainString,
					type: 'terrain',
				} ],
			};
		}
	},
};
