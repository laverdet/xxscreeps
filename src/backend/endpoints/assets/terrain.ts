import type { GameMap } from 'xxscreeps/game/map';
import type { Room } from 'xxscreeps/game/room';
import type { Shard } from 'xxscreeps/engine/db';
import type { Terrain } from 'xxscreeps/game/terrain';
import streamToPromise from 'stream-to-promise';
import makeEtag from 'etag';
import * as Fn from 'xxscreeps/utility/functional';
import { PNG } from 'pngjs';
import { hooks } from 'xxscreeps/backend';
import { runOnce } from 'xxscreeps/utility/memoize';
import { TerrainRender } from 'xxscreeps/backend/symbols';
import { generateRoomName, parseRoomName } from 'xxscreeps/game/position';
import { TERRAIN_MASK_SWAMP, TERRAIN_MASK_WALL, isBorder } from 'xxscreeps/game/terrain';

const onePxImage = runOnce(() => {
	const png = new PNG({
		colorType: 6,
		inputColorType: 6,
		width: 1,
		height: 1,
	});
	png.data.writeInt32LE(0);
	return streamToPromise(png.pack());
});

const brightness2 = (color: number) =>
	0.299 * ((color & 0xff)) ** 2 +
	0.587 * ((color >>> 8) & 0xff) ** 2 +
	0.114 * ((color >>> 16) & 0xff) ** 2;

function terrainColor(terrain: Terrain, xx: number, yy: number) {
	switch (terrain.get(xx, yy)) {
		case TERRAIN_MASK_WALL: return 0xff000000;
		case TERRAIN_MASK_SWAMP: return 0xff132523;
		default: return isBorder(xx, yy) ? 0xff323232 : 0xff2b2b2b;
	}
}

function generate(map: GameMap, grid: (Room | null)[][], zoom: number) {
	// Most of the time we don't need transparency. It's only needed for zoom grids near the edges, so
	// transparency is turned off when possible
	const hasTransparency = grid.some(row => row.some(terrain => !terrain));
	const png = new PNG({
		colorType: hasTransparency ? 6 : 2,
		inputColorType: 6,
		width: 50 * zoom * grid[0].length,
		height: 50 * zoom * grid.length,
	});
	const data32 = new Uint32Array(png.data.buffer, png.data.byteOffset);
	const gh = grid.length;
	const gw = grid[0].length;
	const iwidth = gw * 50 * zoom;
	for (let gy = 0; gy < gh; ++gy) {
		for (let gx = 0; gx < gw; ++gx) {
			// Check color returned by room objects
			const room = grid[gy][gx];
			const colorsByPosition = new Map<number, number>();
			const terrain = room && map.getRoomTerrain(room.name);
			if (room) {
				for (const object of room['#objects']) {
					const color = object[TerrainRender](object);
					if (color !== undefined) {
						colorsByPosition.set(object.pos.x * 50 + object.pos.y, color | 0xff000000);
					}
				}
			}
			const ii = 4 * (gx * zoom * 50 + (gy * zoom * 50) * iwidth);

			if (zoom < 1) {
				// We'll need to resample many nodes into a single pixel
				const size = 50 * zoom;
				for (let yi = 0; yi < size; ++yi) {
					const yo = Math.floor(yi / zoom);
					// The `yi % 2` trick here only works for a zoom level of 0.4. I think this should be
					// abstractly: `0.4 = 2 / 5; f(x) = (x * 5) % 2` but I'm not sure and it also doesn't
					// matter.
					const yw = Math.floor(1 / zoom) + yi % 2;
					for (let xi = 0; xi < size; ++xi) {
						const xo = Math.floor(xi / zoom);
						const xw = Math.floor(1 / zoom) + xi % 2;
						const jj = ii + 4 * (xi + yi * iwidth);
						data32[jj >>> 2] = function() {
							const pixelCount = xw * yw;
							if (terrain) {
								// Check for an object color, in this case it will be averaged with the terrain
								let objectColor: number | undefined;
								for (let yd = 0; yd < yw; ++yd) {
									const yy = yo + yd;
									for (let xd = 0; xd < xw; ++xd) {
										const xx = xo + xd;
										const color = colorsByPosition.get(xx * 50 + yy);
										if (color !== undefined) {
											if (
												objectColor === undefined ||
												brightness2(objectColor) < brightness2(color)
											) {
												objectColor = color;
											}
										}
									}
								}

								// Sample the terrain and take the average
								let rr = 0;
								let gg = 0;
								let bb = 0;
								for (let yd = 0; yd < yw; ++yd) {
									const yy = yo + yd;
									for (let xd = 0; xd < xw; ++xd) {
										const xx = xo + xd;
										const color = terrainColor(terrain, xx, yy);
										rr += (color & 0xff) ** 2;
										gg += ((color >>> 8) & 0xff) ** 2;
										bb += ((color >>> 16) & 0xff) ** 2;
									}
								}
								rr = (rr / pixelCount) ** 0.5;
								gg = (gg / pixelCount) ** 0.5;
								bb = (bb / pixelCount) ** 0.5;
								if (objectColor) {
									rr = ((rr ** 2 + (objectColor & 0xff) ** 2) / 2) ** 0.5;
									gg = ((gg ** 2 + ((objectColor >>> 8) & 0xff) ** 2) / 2) ** 0.5;
									bb = ((bb ** 2 + ((objectColor >>> 16) & 0xff) ** 2) / 2) ** 0.5;
								}
								return (bb << 16) | (gg << 8) | rr | 0xff000000;
							} else {
								return 0;
							}
						}();
					}
				}
			} else {
				// In this case pixels will be repeated
				for (let yy = 0; yy < 50; ++yy) {
					for (let xx = 0; xx < 50; ++xx) {
						const color = function() {
							if (terrain) {
								return colorsByPosition.get(xx * 50 + yy) ?? terrainColor(terrain, xx, yy);
							} else {
								return 0;
							}
						}();
						for (let yz = 0; yz < zoom; ++yz) {
							for (let xz = 0; xz < zoom; ++xz) {
								const jj = ii + 4 * (xz + zoom * xx + (yz + zoom * yy) * iwidth);
								data32[jj >>> 2] = color;
							}
						}
					}
				}
			}
		}
	}
	return streamToPromise(png.pack());
}

function register(paths: string[], fn: (shard: Shard, map: GameMap, room: string) => Promise<Buffer | null>) {
	const cache = new Map<string, { etag: string; payload: Buffer | null }>();
	for (const path of paths) {
		hooks.register('route', {
			path,

			async execute(context) {
				// Fetch PNG from cache, or generate fresh
				const room = `${context.params.room}`;
				const data = cache.get(room) ?? await async function() {
					const payload = await fn(context.shard, context.backend.world.map, room);
					if (payload === null) {
						return { etag: 'nothing', payload: null };
					} else {
						const etag = makeEtag(payload);
						const data = { etag, payload };
						cache.set(room, data);
						return data;
					}
				}();

				// The Screeps client adds a very impolite cache bust to all map URLs. We can make better use
				// of the browser cache by redirecting to a resource which can be cached
				if (
					context.query.bust ||
					(context.query.etag && context.query.etag !== data.etag)
				) {
					// This seems like a risk for infinite redirects at some point, oh well!
					context.status = 301;
					context.redirect(`${context.path}?etag=${encodeURIComponent(data.etag)}`);
					context.set('Cache-Control', 'no-store');
				} else {
					if (context.query.etag) {
						// The redirect above acts as our revalidation in this case
						context.set('Cache-Control', 'public,max-age=31536000,immutable');
					} else {
						// A non-bust request was sent, we can just use plain etag now
						context.set('Cache-Control', 'public');
						context.set('ETag', data.etag);
					}
					context.status = 200;
					context.set('Content-Type', 'image/png');
					context.body = data.payload ?? await onePxImage();
				}
			},
		});
	}
}

// Full thumbnail
register([ '/assets/map/:room.png', '/assets/map/:shard/:room.png' ], async(shard, map, roomName) => {
	if (map.getRoomStatus(roomName)) {
		return generate(map, [ [ await shard.loadRoom(roomName) ] ], 3);
	} else {
		return null;
	}
});

// Grids
for (const [ fragment, grid, align, zoom ] of [ [ 'zoom1', 10, 2, 0.4 ], [ 'zoom2', 4, 0, 1 ] ] as const) {
	register([ `/assets/map/${fragment}/:room.png`, `/assets/map/:shard/${fragment}/:room.png` ], async(shard, map, room) => {
		// Fetch rooms if request is valid
		let didFindRoom = false;
		const { rx: left, ry: top } = parseRoomName(room);
		if ((left + align) % grid === 0 && (top + align) % grid === 0) {
			const rooms = await Promise.all(Fn.map(Fn.range(top, top + grid), yy =>
				Promise.all(Fn.map(Fn.range(left, left + grid), async xx => {
					const roomName = generateRoomName(xx, yy);
					const room = map.getRoomStatus(roomName) ? await shard.loadRoom(roomName) : null;
					didFindRoom ||= room !== null;
					return room;
				})),
			));
			// Render the grid
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (didFindRoom) {
				return generate(map, rooms, zoom);
			}
		}
		return null;
	});
}
