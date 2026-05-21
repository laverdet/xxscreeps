import * as C from 'xxscreeps/game/constants/index.js';
import { LOOK_TERRAIN } from 'xxscreeps/game/constants/find.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createObserver } from 'xxscreeps/mods/observer/observer.js';
import { create as createExtension } from 'xxscreeps/mods/spawn/extension.js';
import { LOOK_STRUCTURES } from 'xxscreeps/mods/structure/constants.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create } from './road.js';

describe('Roads', () => {
	test('under obstacle', () => simulate({
		W0N0: room => {
			room['#insertObject'](createExtension(new RoomPosition(25, 25, 'W0N0'), 1, '100'));
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		const path = room.findPath(new RoomPosition(24, 24, 'W0N0'), new RoomPosition(26, 26, 'W0N0'));
		assert.strictEqual(path.length, 3);
	})));

	test('path cost', () => simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(22, 23, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 24, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 25, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(22, 26, 'W0N0'))); // swamp
			room['#insertObject'](create(new RoomPosition(23, 26, 'W0N0')));
			room['#insertObject'](create(new RoomPosition(24, 26, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		// Follows roads, except corner road
		const path1 = room.findPath(new RoomPosition(21, 22, 'W0N0'), new RoomPosition(25, 26, 'W0N0'));
		assert.strictEqual(path1.length, 5);
		// Strongly prefers roads
		const path2 = room.findPath(new RoomPosition(21, 22, 'W0N0'), new RoomPosition(25, 26, 'W0N0'), { plainCost: 3 });
		assert.strictEqual(path2.length, 6);
		// Don't care about roads
		const path3 = room.findPath(new RoomPosition(21, 22, 'W0N0'), new RoomPosition(25, 26, 'W0N0'), { ignoreRoads: true });
		assert.strictEqual(path3.length, 4);
	})));
});

describe('Room.lookForAtArea', () => {
	test('asArray=false returns sparse map of raw objects (vanilla shape)', () => simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		const result = room.lookForAtArea(LOOK_STRUCTURES, 24, 24, 26, 26) as unknown as
			Record<number, Record<number, { structureType: string }[]>>;
		assert.ok(result[24], 'rows pre-initialized for every y in range');
		assert.strictEqual(result[24][24], undefined, 'cells without matches stay undefined');
		const matches = result[25]?.[25];
		assert.deepStrictEqual(matches?.map(structure => structure.structureType), [ 'road' ]);
		assert.strictEqual(LOOK_STRUCTURES in matches[0]!, false, 'cells hold raw objects, no wrapper key');
	})));

	test('asArray=false LOOK_TERRAIN extracts the terrain string into the cell', () => simulate({})(({ peekRoom }) => peekRoom('W0N0', room => {
		const result = room.lookForAtArea(LOOK_TERRAIN, 10, 10, 10, 10) as unknown as
			Record<number, Record<number, string[]>>;
		assert.strictEqual(result[10]?.[10]?.length, 1);
		assert.ok([ 'plain', 'swamp', 'wall' ].includes(result[10][10][0]!));
	})));
});

describe('Room.lookAtArea', () => {
	test('asArray=false cells wrap entries without spurious x/y keys', () => simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0')));
		},
	})(({ peekRoom }) => peekRoom('W0N0', room => {
		const cell = (room.lookAtArea(25, 25, 25, 25) as unknown as
			Record<number, Record<number, { type: string }[]>>)[25]![25]!;
		assert.deepStrictEqual(cell.map(entry => entry.type).sort(), [ 'structure', 'terrain' ]);
		for (const entry of cell) {
			assert.strictEqual('x' in entry, false);
			assert.strictEqual('y' in entry, false);
		}
	})));
});

describe('Road cold-start wake repair', () => {
	const dormantRoad = simulate({
		W1N1: room => {
			room['#insertObject'](createObserver(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#level'] = 8;
			room['#user'] = '100';
			room.controller!['#user'] = '100';
		},
		W2N2: room => {
			const road = create(new RoomPosition(25, 25, 'W2N2'));
			road['#nextDecayTime'] = 5;
			room['#insertObject'](road);
		},
	});

	test('dormant road survives inter-room intent past its decay target', () =>
		dormantRoad(async ({ peekRoom, player, shard, tick }) => {
			const startTime = shard.time;
			await shard.copyRoomFromPreviousTick('W2N2', startTime + 1);

			// Drift past #nextDecayTime. W2N2 has no players, so without
			// cold-start wake repair it stays out of every tracking set and the
			// decay target rots in the saved blob.
			await tick(10);
			assert.strictEqual(shard.time, startTime + 10);

			await player('100', Game => {
				const observer = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_OBSERVER)[0];
				assert.strictEqual(observer?.observeRoom('W2N2'), C.OK);
			});
			// Pre-fix: throws here. finalize-extra runs the road's Tick handler
			// at Game.time=11 and requiredExpiryTime(5) blows up.
			await tick();

			await peekRoom('W2N2', room => {
				const road = lookForStructures(room, C.STRUCTURE_ROAD)[0];
				assert.ok(road, 'road survived the decay catch-up');
				assert.ok(road.hits < road.hitsMax, 'decay step actually ran');
				assert.ok(road['#nextDecayTime'] > shard.time, 'decay target rescheduled');
			});
		}));
});
