import streamToPromise from 'stream-to-promise';
import { PNG } from 'pngjs';
import { Endpoint } from '~/backend/endpoint';
import { generateRoomName, parseRoomName } from '~/game/position';
import { Terrain, isBorder, kTerrainWall, kTerrainSwamp } from '~/game/terrain';

function generate(grid: (Terrain | undefined)[][], zoom = 1) {
	// Most of the time we don't need transparency. It's only needed for zoom2 images near the edges,
	// so transparency is turned off when possible
	const hasTransparency = grid.some(row => row.some(terrain => !terrain));
	const png = new PNG({
		colorType: hasTransparency ? 6 : 2,
		inputColorType: 6,
		width: 50 * zoom * grid[0].length,
		height: 50 * zoom * grid.length,
	});
	const gh = grid.length;
	const gw = grid[0].length;
	const iwidth = gw * 50;
	for (let gy = 0; gy < gh; ++gy) {
		for (let gx = 0; gx < gw; ++gx) {
			const terrain = grid[gy][gx];
			for (let yy = 0; yy < 50; ++yy) {
				for (let xx = 0; xx < 50; ++xx) {
					const color = function() {
						if (terrain) {
							switch (terrain.get(xx, yy)) {
								case kTerrainWall: return [ 0x00, 0x00, 0x00, 0xff ];
								case kTerrainSwamp: return [ 0x23, 0x25, 0x13, 0xff ];
								default: return isBorder(xx, yy) ?
									[ 0x32, 0x32, 0x32, 0xff ] : [ 0x2b, 0x2b, 0x2b, 0xff ];
							}
						} else {
							return [ 0, 0, 0, 0 ];
						}
					}();
					for (let yz = 0; yz < zoom; ++yz) {
						for (let xz = 0; xz < zoom; ++xz) {
							const ii = 4 * (
								xz + zoom * (xx + gx * zoom * 50 +
								(yz + zoom * (yy + gy * zoom * 50)) * iwidth)
							);
							[ png.data[ii], png.data[ii + 1], png.data[ii + 2], png.data[ii + 3] ] = color;
						}
					}
				}
			}
		}
	}
	return streamToPromise(png.pack());
}

const cache = new Map<string, Buffer>();
export const TerrainEndpoint: Endpoint = {
	path: '/map/:room.png',

	async execute(req, res) {
		const { room } = req.params;
		let png = cache.get(room);
		if (!png) {
			const terrain = this.context.world.get(room);
			if (terrain) {
				png = await generate([[ terrain ]], 3);
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

const cacheZoom = new Map<string, Buffer>();
export const TerrainZoomEndpoint: Endpoint = {
	path: '/map/zoom2/:room.png',

	async execute(req, res) {
		const { room } = req.params;
		let png = cacheZoom.get(room);
		if (!png) {
			// Calculate which rooms to render
			let didFindRoom = false;
			const [ left, top ] = parseRoomName(req.params.room);
			if (left % 4 === 0 && top % 4 === 0) {
				const grid: (Terrain | undefined)[][] = [];
				for (let yy = top; yy < top + 4; ++yy) {
					grid.push([]);
					const row = grid[grid.length - 1];
					for (let xx = left; xx < left + 4; ++xx) {
						const terrain = this.context.world.get(generateRoomName(xx, yy));
						didFindRoom = didFindRoom || terrain !== undefined;
						row.push(terrain);
					}
				}
				// Render the grid
				if (didFindRoom) {
					png = await generate(grid);
					cacheZoom.set(room, png);
				}
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
