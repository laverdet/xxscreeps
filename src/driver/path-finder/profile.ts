import fs from 'fs';
import { loadTerrain, search } from 'xxscreeps/driver/path-finder.js';
import { CostMatrix } from 'xxscreeps/game/path-finder/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { World } from 'xxscreeps/game/map.js';

/**
 * This script is a standalone test for the path finder. It runs a whole bunch of path finding
 * operations on real terrain data from a screeps server. It also verifies that the results are the
 * same as previous runs (kind of). This is also used for profile-guided optimization builds.
 */

// Load terrain into module
loadTerrain(new World('test', new Uint8Array(fs.readFileSync(`${__dirname}/terrain`))));

// Generate a deterministic CostMatrix
const costMatrix = new CostMatrix;
for (let ii = 0; ii < 2500; ++ii) {
	if (ii % 7 === 0) {
		costMatrix._bits[ii] = ii % 11;
	}
}

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
const start = process.hrtime();
let checksum = 0;
for (let count = 0; count < 20; ++count) {
	for (let ii = 0; ii < positions.length; ++ii) {
		for (let jj = 0; jj < positions.length; ++jj) {
			if (ii === jj) continue;
			const ret = search(
				positions[ii],
				[ { range: ii % 3, pos: positions[jj] } ],
				{
					plainCost: 1,
					swampCost: 5,
					maxRooms: 16,
					maxCost: 100000,
					maxOps: 100000,
					heuristicWeight: 1.2,
				},
			);
			checksum += ret.path.length + ret.ops;
		}
	}
}
const time = process.hrtime(start);
if (checksum !== 17779280) {
	console.error('Incorrect results!');
	process.exit(1);
}
console.log(time[0] + time[1] / 1e9);
