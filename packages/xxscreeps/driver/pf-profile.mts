import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as util from 'node:util';
import { loadTerrain, search } from 'xxscreeps/driver/pathfinder.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { World } from 'xxscreeps/game/map.js';
import { CostMatrix } from 'xxscreeps/game/pathfinder/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { TERRAIN_MASK_WALL } from 'xxscreeps/game/terrain.js';

const iterations = Number(process.argv.at(-1)) || 1;
const log = process.argv.includes('--log');

/**
 * This script is a standalone test for the path finder. It runs a whole bunch of path finding
 * operations on real terrain data from a screeps server. It also verifies that the results are the
 * same as previous runs (kind of). This is also used for profile-guided optimization builds.
 */

// Load terrain into module
const world = new World('test', fs.readFileSync('terrain'));
loadTerrain(world);

// Generate deterministic CostMatrix's
const costMatrix = (roomName: string) => {
	const matrix = new CostMatrix();
	const terrain = world.map.getRoomTerrain(roomName);
	for (let yy = 0; yy < 50; ++yy) {
		for (let xx = 0; xx < 50; ++xx) {
			const ii = xx * 50 + yy;
			if (terrain.get(xx, yy) !== TERRAIN_MASK_WALL) {
				matrix.set(xx, yy, ii % 193 ? ii % 15 : 0xff);
			}
		}
	}
	return matrix;
};
const matrices = Fn.pipe(
	[ 'W1N1', 'W2N2', 'W3N3', 'W3N7', 'W4N1', 'W4N8', 'W5N3', 'W5N5', 'W6N5', 'W7N5', 'W8N5', 'W9N8' ],
	$$ => Fn.map($$, roomName => [ roomName, costMatrix(roomName) ] as const),
	$$ => Fn.fromEntries($$));

// Various rooms around my world
const positions = [
	new RoomPosition(20, 39, 'W5N3'),
	new RoomPosition(31, 20, 'W5N4'),
	new RoomPosition(15, 30, 'W6N5'),
	new RoomPosition(14, 18, 'W7N5'),
	new RoomPosition(16, 41, 'W8N5'),
	new RoomPosition(35, 7, 'W6N2'),
	new RoomPosition(3, 25, 'W5N2'),
	new RoomPosition(4, 40, 'W4N1'),
	new RoomPosition(11, 36, 'W3N1'),
	new RoomPosition(33, 29, 'W2N2'),
	new RoomPosition(45, 5, 'W3N3'),
	new RoomPosition(31, 12, 'W4N4'),
	new RoomPosition(1, 27, 'W5N5'),
	new RoomPosition(17, 14, 'W6N6'),
	new RoomPosition(22, 14, 'W7N7'),
	new RoomPosition(21, 20, 'W8N8'),
	new RoomPosition(25, 33, 'W9N8'),
	new RoomPosition(29, 21, 'W10N10'),
	new RoomPosition(32, 26, 'W1N1'),
	new RoomPosition(32, 33, 'W2N2'),
	new RoomPosition(41, 35, 'W3N8'),
	new RoomPosition(20, 34, 'W3N7'),
	new RoomPosition(44, 33, 'W4N8'),
	new RoomPosition(44, 32, 'W3N7'),
];

// Find every point to every other point
const hash = crypto.createHash('sha256');
const start = process.hrtime();
for (let count = 0; count < iterations; ++count) {
	for (const [ ii, one ] of positions.entries()) {
		for (const [ jj, two ] of positions.entries()) {
			if (ii === jj) continue;
			const ret = search(
				one,
				[ { range: ii % 3, pos: two } ],
				{
					plainCost: 1,
					swampCost: 5,
					maxRooms: 16,
					maxCost: 100000,
					maxOps: 100000,
					heuristicWeight: 1.2,
					roomCallback: ii % 2 === 0 ? roomName => matrices[roomName] : undefined,
				},
			);
			hash.update(JSON.stringify(ret));
			if (log) {
				console.log(util.inspect(ret, { depth: null, maxArrayLength: null }));
			}
		}
	}
}
const time = process.hrtime(start);
const checksum = hash.digest('hex').slice(0, 8);
console.log(time[0] + time[1] / 1e9);
if (iterations === 1 && checksum !== '6254dc11') {
	console.error('Incorrect results! ' + checksum);
	process.exit(1);
}
