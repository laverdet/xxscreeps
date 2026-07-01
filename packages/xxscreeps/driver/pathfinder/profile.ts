import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as util from 'node:util';
import { Agent, expectComplete } from '@isolated-vm/experimental';
import { makeCachedLoader, makeLinker } from '@isolated-vm/experimental/utility/linker';
import { resolve } from '@loaderkit/resolve/esm';
import { defaultAsyncFileSystem } from '@loaderkit/resolve/fs';
import { loadTerrain, search } from 'xxscreeps/driver/pathfinder/pathfinder.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { World } from 'xxscreeps/game/map.js';
import { CostMatrix } from 'xxscreeps/game/pathfinder/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { TERRAIN_MASK_WALL } from 'xxscreeps/game/terrain.js';

const iterations = Number(process.argv.at(-1)) || 1;
const log = process.argv.includes('--log');
const expectedResult = '156ef000';

/**
 * This script is a standalone test for the path finder. It runs a whole bunch of path finding
 * operations on real terrain data from a screeps server. It also verifies that the results are the
 * same as previous runs (kind of). This is also used for profile-guided optimization builds.
 */

// Load terrain into module
const world = new World('test', await fs.readFile('terrain'));
loadTerrain(world);

// Generate deterministic CostMatrix's
const matrices = function() {
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
	return Fn.pipe(
		[ 'W1N1', 'W2N2', 'W3N3', 'W3N7', 'W4N1', 'W4N8', 'W5N3', 'W5N5', 'W6N5', 'W7N5', 'W8N5', 'W9N8' ],
		$$ => Fn.map($$, roomName => [ roomName, costMatrix(roomName) ] as const),
		$$ => Fn.fromEntries($$));
}();

// Various rooms around my world (stringified function)
const makePositions = () => [
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

// Dispatch pathfinding profile
const dispatch = (update: (result: unknown) => void) => {
	const positions = makePositions();
	for (let count = 0; count < iterations; ++count) {
		// Find every point to every other point
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
						heuristicWeight: ii % 7 === 0 ? 1 : 1.2,
						roomCallback: ii % 2 === 0 ? roomName => matrices[roomName] : undefined,
					},
				);
				update(ret);
			}
		}
	}
	// Perform one recursive search
	const pos1 = new RoomPosition(17, 47, 'W4N2');
	const pos2 = new RoomPosition(36, 9, 'W4N2');
	search(pos1, pos2, {
		roomCallback: () => {
			update(search(pos1, pos2));
		},
	});
};

if (process.argv.includes('--with-sandbox')) {

	// Initialize a minimal sandbox for pathfinding
	const pf = await import('@xxscreeps/pathfinder/iv');
	await using agent = await Agent.create();
	const realm = await agent.createRealm();
	const hash = crypto.createHash('sha256');
	const hook = await realm.createCapability(
		() => ({
			update: result => {
				const string = String(result);
				hash.update(string);
				if (log) {
					console.log(util.inspect(JSON.parse(string), { depth: null, maxArrayLength: null }));
				}
			},
		}),
		{ origin: 'xxscreeps:pathfinder' });
	const resolver = async (specifier: string, referrer?: string) => {
		switch (specifier) {
			case '#iv': return 'xxscreeps:pathfinder';
			default: return async function() {
				const alias = function() {
					switch (specifier) {
						case '@xxscreeps/pathfinder': return '@xxscreeps/pathfinder/iv';
						case 'tslib': return 'tslib/tslib.es6.mjs';
						case 'xxscreeps:hook': return 'xxscreeps:hook';
						case 'xxscreeps:private-symbol': return 'xxscreeps/driver/private/symbol/unsafe.js';
						case 'xxscreeps/engine/schema/build/index.js': return 'xxscreeps/engine/schema/build/runtime.js';
						default: return specifier;
					}
				}();
				const { url } = await resolve(defaultAsyncFileSystem, alias, new URL(referrer ?? import.meta.url));
				return url.href;
			}();
		}
	};
	const loader = async (url: string) => {
		switch (url) {
			case 'xxscreeps:hook': return hook;
			case 'xxscreeps:pathfinder': return pf.module.instantiate(realm);
			default: {
				const sourceText = await async function() {
					if (url.startsWith('xxscreeps:')) {
						switch (url) {
							case 'xxscreeps:mods/constants': return 'export {};';
							case 'xxscreeps:packages': return 'export default [];';
							default: throw new Error(`Unknown virtual module: ${url}`);
						}
					} else {
						return fs.readFile(new URL(url), 'utf8');
					}
				}();
				const module = agent.compileModule(sourceText, { origin: { name: url } });
				return expectComplete(await module);
			}
		}
	};
	const module = expectComplete(await agent.compileModule(`
		import { update } from 'xxscreeps:hook';
		import { CostMatrix } from 'xxscreeps/game/pathfinder/index.js';
		import { RoomPosition } from 'xxscreeps/game/position.js';
		import { search } from 'xxscreeps/driver/pathfinder/pathfinder.js';
		import { Fn } from 'xxscreeps/functional/fn.js';
		const iterations = ${iterations};
		const makePositions = ${String(makePositions)};
		const dispatch = ${String(dispatch)};
		dispatch(result => update(JSON.stringify(result)));
	`));
	const global = await realm.acquireGlobalObject();
	await global.set('matrices', matrices);
	await module.link(realm, makeLinker(resolver, makeCachedLoader(loader)));
	const start = process.hrtime();
	expectComplete(await module.evaluate(realm));
	const time = process.hrtime(start);
	console.log(time[0] + time[1] / 1e9);
	const checksum = hash.digest('hex').slice(0, 8);
	if (iterations === 1 && checksum !== expectedResult) {
		console.error('Incorrect results! ' + checksum);
		process.exit(1);
	}

} else {
	// Local pathfinder module
	const hash = crypto.createHash('sha256');
	const update = (result: unknown) => {
		hash.update(JSON.stringify(result));
		if (log) {
			console.log(util.inspect(result, { depth: null, maxArrayLength: null }));
		}
	};
	const start = process.hrtime();
	dispatch(update);
	const time = process.hrtime(start);
	const checksum = hash.digest('hex').slice(0, 8);
	console.log(time[0] + time[1] / 1e9);
	if (iterations === 1 && checksum !== expectedResult) {
		console.error('Incorrect results! ' + checksum);
		process.exit(1);
	}
}
