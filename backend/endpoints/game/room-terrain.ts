import { Endpoint } from 'xxscreeps/backend/endpoint';

const cache = new Map<string, string>();
export const RoomTerrainEndpoint: Endpoint = {
	path: '/room-terrain',

	execute(req, res) {
		const room = `${req.query.room}`;
		let terrainString = cache.get(room);
		if (terrainString === undefined) {
			const terrain = this.context.world.get(room);
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
			res.set('Cache-Control', 'public,max-age=31536000,immutable');
			return {
				ok: 1,
				terrain: [ {
					_id: req.query.room,
					room: req.query.room,
					terrain: terrainString,
					type: 'terrain',
				} ],
			};
		}
	},
};
