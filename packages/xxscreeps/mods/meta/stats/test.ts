import { mappedPrimitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { iterateNeighbors } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

const alice = '100';
const bob = '101';

describe('mod/meta/stats', () => {
	const sim = simulate({
		W1N1: room => {
			const source = room.find(C.FIND_SOURCES)[0]!;
			source.energy = 3000;
			const terrain = room.getTerrain();
			const [ first, second ] = Fn.reject(
				iterateNeighbors(source.pos), pos => terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL);
			room['#insertObject'](createCreep(first!, [ C.WORK, C.WORK, C.CARRY, C.MOVE ], 'harvester', alice));
			room['#insertObject'](createCreep(second!, [ C.WORK, C.CARRY, C.MOVE ], 'poacher', bob));
		},
	});

	test('contributions coalesce per (user, stat) on the room blob', () => sim(async ({ player, tick }) => {
		const perTick = 2 * C.HARVEST_POWER;

		await player(alice, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await tick();
		let statsTime = 0;
		await player(alice, Game => {
			const [ stats, aggregate ] = Game.rooms.W1N1?.['#userStats'] ?? [];
			assert.ok(stats);
			assert.strictEqual(aggregate, undefined);
			assert.strictEqual(stats.userId, alice);
			assert.strictEqual(stats.stat, 'energyHarvested');
			assert.strictEqual(stats.amount, perTick);
			statsTime = Game.rooms.W1N1?.['#userStatsTime'] ?? 0;
			assert.ok(statsTime > 0);
			// A second harvest accumulates into the same entry
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await tick();
		await player(alice, Game => {
			const [ stats, aggregate ] = Game.rooms.W1N1?.['#userStats'] ?? [];
			assert.ok(stats);
			assert.strictEqual(aggregate, undefined);
			assert.strictEqual(stats.amount, 2 * perTick);
			// The bucket timestamp is stamped once
			assert.strictEqual(Game.rooms.W1N1?.['#userStatsTime'], statsTime);
		});
	}));

	test('contributions are attributed per user', () => sim(async ({ player, tick }) => {
		await player(alice, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.harvester?.harvest(source!), C.OK);
		});
		await player(bob, Game => {
			const source = Game.rooms.W1N1?.find(C.FIND_SOURCES)[0];
			assert.strictEqual(Game.creeps.poacher?.harvest(source!), C.OK);
		});
		await tick();
		await player(alice, Game => {
			const stats = Game.rooms.W1N1?.['#userStats'];
			assert.deepStrictEqual(
				stats?.map(entry => [ entry.userId, entry.stat, entry.amount ] as const)
					.sort(mappedPrimitiveComparator(entry => entry[0])),
				[ [ alice, 'energyHarvested', 2 * C.HARVEST_POWER ], [ bob, 'energyHarvested', C.HARVEST_POWER ] ]);
		});
	}));
});
