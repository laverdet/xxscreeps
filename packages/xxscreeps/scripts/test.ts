import * as assert from 'node:assert';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { findWorldBoundary, generateRoom, sealWorldBoundary, worldBoundary } from './room-gen.js';

// A world of the named rooms, each opening on all four sides.
function openWorld(...roomNames: string[]) {
	return new Map(Fn.map(roomNames, roomName => [ roomName, { exits: 0b1111 } ] as const));
}

describe('scripts/room-gen', () => {
	test('names the sides facing rooms the world lacks', () => {
		// W1N0 lies west of W0N0, so the two share W0N0's left border with W1N0's right.
		assert.deepStrictEqual(worldBoundary(openWorld('W0N0', 'W1N0')), [
			{ roomName: 'W0N0', sealed: [ 'top', 'right', 'bottom' ] },
			{ roomName: 'W1N0', sealed: [ 'top', 'bottom', 'left' ] },
		]);
	});

	test('crosses the world axes', () => {
		// W0N0's right neighbor is E0N0 and its bottom neighbor is W0S0; the result is name-ordered.
		assert.deepStrictEqual(
			worldBoundary(openWorld('W0N0', 'E0N0', 'W0S0')).map(room => room.sealed), [
				[ 'top', 'right', 'bottom' ],
				[ 'top', 'left' ],
				[ 'right', 'bottom', 'left' ],
			]);
	});

	test('carries a walled side along with the opening', () => {
		// A lone room whose only opening is to the north. Rebuilding re-rolls every border the caller
		// doesn't author, so the three walled sides are authored again rather than left alone.
		assert.deepStrictEqual(worldBoundary(new Map([ [ 'W0N0', { exits: 0b0001 } ] ])), [
			{ roomName: 'W0N0', sealed: [ 'top', 'right', 'bottom', 'left' ] },
		]);
	});

	test('leaves a fully walled room alone', () => {
		assert.deepStrictEqual(worldBoundary(new Map([ [ 'W0N0', { exits: 0 } ] ])), []);
	});

	test('seals a world without disturbing its sector meta', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		// The fixture's sector is walled in already; a pair of rooms around a sector center is the
		// smallest world carrying both an open boundary and sector meta to preserve.
		await shard.data.flushdb();
		await shard.data.set('time', shard.time);
		await generateRoom(shard, 'W25N25');
		await generateRoom(shard, 'W24N25');
		const before = new Map(Fn.map((await shard.loadWorld()).terrain.entries(),
			([ roomName, record ]) => [ roomName, record.sectors.join() ] as const));
		await sealWorldBoundary(shard);
		const after = (await shard.loadWorld()).terrain;
		for (const [ roomName, record ] of after) {
			assert.strictEqual(record.sectors.join(), before.get(roomName), `${roomName} keeps its sectors`);
		}
		assert.ok(after.get('W25N25')!.sectorControl, 'the center keeps its sector control');
		assert.deepStrictEqual(await findWorldBoundary(shard), [], 'the boundary settles in one pass');
	});

	test('leaves a room sealed on all four sides some ground', async () => {
		await using testShard = await instantiateTestShard();
		const { shard } = testShard;
		// A world of one room seals every side of it, and E0S0's name makes it a highway crossing --
		// the terrain that carries no reroll to fall back on.
		await shard.data.flushdb();
		await shard.data.set('time', shard.time);
		await generateRoom(shard, 'E0S0');
		await sealWorldBoundary(shard);
		const { terrain } = (await shard.loadWorld()).terrain.get('E0S0')!;
		assert.ok(
			Fn.some(Fn.range(50), yy => Fn.some(Fn.range(50), xx => terrain.get(xx, yy) !== C.TERRAIN_MASK_WALL)),
			'the room is not solid wall');
	});
});
