import type { Room } from 'xxscreeps/game/room';
import type { Shard } from 'xxscreeps/engine/model/shard';
import streamToPromise from 'stream-to-promise';
import crypto from 'crypto';
import * as Fn from 'xxscreeps/utility/functional';
import { registerBackendMiddleware } from 'xxscreeps/backend';
import { PNG } from 'pngjs';
import { TerrainRender } from 'xxscreeps/backend/symbols';
import { generateRoomName, parseRoomName } from 'xxscreeps/game/position';
import { isBorder, TERRAIN_MASK_WALL, TERRAIN_MASK_SWAMP } from 'xxscreeps/game/terrain';

function generate(grid: (Room | null)[][], zoom = 1) {
	// Most of the time we don't need transparency. It's only needed for zoom2 images near the edges,
	// so transparency is turned off when possible
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
	const iwidth = gw * 50;
	for (let gy = 0; gy < gh; ++gy) {
		for (let gx = 0; gx < gw; ++gx) {
			// Check color returned by room objects
			const room = grid[gy][gx];
			const terrain = room?.getTerrain();
			const colorsByPosition = new Map<number, number>();
			if (room) {
				for (const object of room._objects) {
					const color = object[TerrainRender](object);
					if (color !== undefined) {
						colorsByPosition.set(object.pos.x * 50 + object.pos.y, color);
					}
				}
			}
			// Generate color based on terrain
			for (let yy = 0; yy < 50; ++yy) {
				for (let xx = 0; xx < 50; ++xx) {
					const color = function() {
						if (terrain) {
							const objectColor = colorsByPosition.get(xx * 50 + yy);
							if (objectColor !== undefined) {
								return objectColor | 0xff000000;
							}
							switch (terrain.get(xx, yy)) {
								case TERRAIN_MASK_WALL: return 0xff000000;
								case TERRAIN_MASK_SWAMP: return 0xff132523;
								default: return isBorder(xx, yy) ? 0xff323232 : 0xff2b2b2b;
							}
						} else {
							return 0;
						}
					}();
					for (let yz = 0; yz < zoom; ++yz) {
						for (let xz = 0; xz < zoom; ++xz) {
							const ii = 4 * (
								xz + zoom * (xx + gx * zoom * 50 +
								(yz + zoom * (yy + gy * zoom * 50)) * iwidth)
							);
							data32[ii >>> 2] = color;
						}
					}
				}
			}
		}
	}
	return streamToPromise(png.pack());
}

registerBackendMiddleware((koa, router) => {
	function use(paths: string[], fn: (shard: Shard, room: string) => Promise<Buffer | null>) {
		const cache = new Map<string, { etag: string; payload: Buffer | null }>();
		router.get(paths, async context => {
			// Fetch PNG from cache, or generate fresh
			const room = `${context.params.room}`;
			let data = cache.get(room);
			if (data === undefined) {
				const payload = await fn(context.shard, room);
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
			if (context.query.etag === data.etag) {
				context.set('Cache-Control', 'public,max-age=31536000,immutable');
				if (data.payload) {
					context.set('Content-Type', 'image/png');
					context.body = data.payload;
				} else {
					context.status = 404;
					return '';
				}
			} else {
				// This seems like a risk for infinite redirects at some point, oh well!
				context.status = 301;
				context.redirect(`${context.path}?etag=${encodeURIComponent(data.etag)}`);
			}
		});
	}

	use([ '/assets/map/zoom2/:room.png', '/assets/map/:shard/zoom2/:room.png' ], async(shard, room) => {
		// Fetch rooms if requset is valid
		let didFindRoom = false;
		const { rx: left, ry: top } = parseRoomName(room);
		if (left % 4 === 0 && top % 4 === 0) {
			const grid = await Promise.all(Fn.map(Fn.range(top, top + 4), yy =>
				Promise.all(Fn.map(Fn.range(left, left + 4), async xx => {
					const roomName = generateRoomName(xx, yy);
					const room = await shard.loadRoom(roomName).catch(() => null);
					didFindRoom ||= room !== null;
					return room;
				})),
			));
			// Render the grid
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (didFindRoom) {
				return generate(grid);
			}
		}
		return null;
	});

	use([ '/assets/map/:room.png', '/assets/map/:shard/:room.png' ], async(shard, roomName) => {
		const room = await shard.loadRoom(roomName).catch(() => null);
		return room ? generate([ [ room ] ], 3) : null;
	});
});
