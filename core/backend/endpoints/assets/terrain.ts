import streamToPromise from 'stream-to-promise';
import crypto from 'crypto';
import { PNG } from 'pngjs';
import { Endpoint } from 'xxscreeps/backend/endpoint';
import { generateRoomName, parseRoomName } from 'xxscreeps/game/position';
import { Terrain, isBorder, TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP } from 'xxscreeps/game/terrain';
import { BackendContext } from 'xxscreeps/backend/context';

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
								case TERRAIN_MASK_WALL: return [ 0x00, 0x00, 0x00, 0xff ];
								case TERRAIN_MASK_SWAMP: return [ 0x23, 0x25, 0x13, 0xff ];
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

type TerrainRenderer = (context: BackendContext, room: string) => Promise<Buffer | null>;
function makeTerrainEndpoint(path: string, fn: TerrainRenderer): Endpoint {
	const cache = new Map<string, { etag: string; payload: Buffer | null }>();
	return {
		path,

		async execute(req, res) {
			// Fetch PNG from cache, or generate fresh
			const { room } = req.params;
			let data = cache.get(room);
			if (data === undefined) {
				const payload = await fn(this.context, room);
				if (payload === null) {
					data = { etag: 'nothing', payload: null };
				} else {
					const etag = crypto.createHash('sha1').update(payload).digest('base64');
					data = { etag, payload };
					cache.set(room, data);
				}
			}
			// The Screeps client adds a very impolite cache bust to all map URLs. We can make better use
			// of the browser cache by redirecting to a resource which can be cached
			if (req.query.etag === data.etag) {
				res.set('Cache-Control', 'public,max-age=31536000,immutable');
				if (data.payload) {
					res.set('Content-Type', 'image/png');
					res.writeHead(200);
					res.end(data.payload);
				} else {
					res.writeHead(404);
					res.end();
				}
			} else {
				// This seems like a risk for infinite redirects at some point, oh well!
				res.redirect(301, `${req.baseUrl}${req.path}?etag=${encodeURIComponent(data.etag)}`);
			}
		},
	};
}

export const TerrainEndpoint = makeTerrainEndpoint('/map/:room.png', async(context, room) => {
	const terrain = context.world.get(room);
	if (terrain) {
		return generate([ [ terrain ] ], 3);
	}
	return null;
});

export const TerrainZoomEndpoint = makeTerrainEndpoint('/map/zoom2/:room.png', async(context, room) => {
	// Calculate which rooms to render
	let didFindRoom = false;
	const { rx: left, ry: top } = parseRoomName(room);
	if (left % 4 === 0 && top % 4 === 0) {
		const grid: (Terrain | undefined)[][] = [];
		for (let yy = top; yy < top + 4; ++yy) {
			grid.push([]);
			const row = grid[grid.length - 1];
			for (let xx = left; xx < left + 4; ++xx) {
				const terrain = context.world.get(generateRoomName(xx, yy));
				didFindRoom = didFindRoom || terrain !== undefined;
				row.push(terrain);
			}
		}
		// Render the grid
		if (didFindRoom) {
			return generate(grid);
		}
	}
	return null;
});
