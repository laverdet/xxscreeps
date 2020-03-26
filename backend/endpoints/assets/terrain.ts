import streamToPromise from 'stream-to-promise';
import { PNG } from 'pngjs';
import { Endpoint } from '~/backend/endpoint';
import { Terrain, isBorder, kTerrainWall, kTerrainSwamp } from '~/engine/game/terrain';

function generate(terrain: Terrain, zoom = 1) {
	const png = new PNG({
		colorType: 2,
		inputColorType: 2,
		width: 50 * zoom,
		height: 50 * zoom,
	});
	for (let yy = 0; yy < 50; ++yy) {
		for (let xx = 0; xx < 50; ++xx) {
			const color = function() {
				switch (terrain.get(xx, yy)) {
					case kTerrainWall: return [ 0x00, 0x00, 0x00 ];
					case kTerrainSwamp: return [ 0x23, 0x25, 0x13 ];
					default: return isBorder(xx, yy) ?
						[ 0x32, 0x32, 0x32 ] : [ 0x2b, 0x2b, 0x2b ];
				}
			}();
			for (let yz = 0; yz < zoom; ++yz) {
				for (let xz = 0; xz < zoom; ++xz) {
					const ii = (xz + zoom * (xx + (yy * zoom + yz) * 50)) * 3;
					[ png.data[ii], png.data[ii + 1], png.data[ii + 2] ] = color;
				}
			}
		}
	}
	return streamToPromise(png.pack());
}

const cache = new Map<string, Buffer>();
export const TerrainEndpoint: Endpoint = {
	method: 'get',
	path: '/map/:room.png',

	async execute(req, res) {
		const { room } = req.params;
		let png = cache.get(room);
		if (!png) {
			const terrain = this.context.world.get(room);
			if (terrain) {
				png = await generate(terrain, 3);
				cache.set(room, png);
			}
		}
		if (png) {
			res.set('Cache-Control', 'public,max-age=31536000,immutable');
			res.set('Content-Type', 'image/png');
			res.writeHead(200);
			res.end(png);
			return true;
		}
	},
};
