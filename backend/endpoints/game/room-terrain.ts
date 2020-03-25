import { Endpoint } from '~/backend/endpoint';
import { worldTerrain } from '../assets/terrain';

export const RoomTerrainEndpoint: Endpoint = {
	method: 'get',
	path: '/room-terrain',

	async execute(req) {
		const world = await worldTerrain();
		for (const room of world) {
			if (room.roomName === req.query.room) {
				let terrain = '';
				for (let yy = 0; yy < 50; ++yy) {
					for (let xx = 0; xx < 50; ++xx) {
						terrain += room.terrain.get(xx, yy);
					}
				}
				return {
					ok: 1,
					terrain: [ {
						_id: req.query.room,
						room: req.query.room,
						terrain,
						type: 'terrain',
					} ],
				};
			}
		}
	},
};
