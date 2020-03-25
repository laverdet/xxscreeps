import { PNG } from 'pngjs';
import { Endpoint } from '~/backend/endpoint';
import * as MapSchema from '~/engine/game/map';
import { Terrain, isBorder, kTerrainWall, kTerrainSwamp } from '~/engine/game/terrain';
import { BufferView } from '~/engine/schema/buffer-view';
import { getReader } from '~/engine/schema/read';
import { BlobStorage } from '~/storage/blob';

let worldTerrainPromise: Promise<MapSchema.World> | undefined;
export function worldTerrain() {
	if (worldTerrainPromise) {
		return worldTerrainPromise;
	}
	return worldTerrainPromise = async function() {
		const blobStorage = await BlobStorage.connect();
		const buffer = await blobStorage.load('terrain');
		const view = new BufferView(buffer.buffer, buffer.byteOffset);
		const read = getReader(MapSchema.schema.World, MapSchema.interceptorSchema);
		return read(view, 0);
	}();
}

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
	return png.pack();
}

export const TerrainEndpoint: Endpoint = {
	method: 'get',
	path: '/map/:room.png',

	async execute(req, res) {
		for (const room of await worldTerrain()) {
			if (room.roomName === req.params.room) {
				res.set('Content-Type', 'image/png');
				res.writeHead(200);
				generate(room.terrain, 3).pipe(res);
				return false;
			}
		}
	},
};
