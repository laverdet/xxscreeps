import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { activeRoomsKey } from 'xxscreeps/engine/processor/model.js';
import { create as createCreep, type PartType } from 'xxscreeps/mods/creep/creep.js';
import { create as createKeeperLair } from './keeper-lair.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Tombstone decay scheduling', () => {
	// Room with a keeper lair and a source keeper about to die from age.
	// The lair's Tick processor should detect the death and start the respawn
	// timer, and the tombstone should eventually be cleaned up.
	// See: https://github.com/laverdet/xxscreeps/issues/58
	const keeperBody: PartType[] = [
		...Array<PartType>(17).fill(C.TOUGH),
		...Array<PartType>(13).fill(C.MOVE),
		...Array<PartType>(10).fill(C.ATTACK),
		...Array<PartType>(10).fill(C.RANGED_ATTACK),
	];

	const keeperRoom = simulate({
		W5N5: room => {
			const lair = createKeeperLair(new RoomPosition(25, 25, 'W5N5'));
			room['#insertObject'](lair);
			const keeper = createCreep(new RoomPosition(26, 25, 'W5N5'), keeperBody, `Keeper${lair.id}`, '3');
			// Set ageTime so the keeper dies on the SECOND processor tick.
			// First tick: keeper alive, Tick processor schedules wakeAt(ageTime).
			// Room sleeps until ageTime. Second tick (at ageTime): keeper dies.
			keeper['#ageTime'] = 3;
			room['#insertObject'](keeper);
		},
	});

	test('room schedules wake after keeper age death', () => keeperRoom(async ({ shard, tick, peekRoom }) => {
		// Activate the room so it processes on the first tick
		await shard.scratch.zadd(activeRoomsKey, [ [ 0, 'W5N5' ] ]);

		// Tick 1 (Game.time=2): keeper alive, schedules wakeAt(3)
		await tick();
		await peekRoom('W5N5', room => {
			const creeps = room['#lookFor'](C.LOOK_CREEPS);
			assert.strictEqual(creeps.filter(c => c.name.startsWith('Keeper')).length, 1, 'keeper should be alive after tick 1');
		});

		// Tick 2 (Game.time=3): keeper dies from age, tombstone created
		await tick();
		await peekRoom('W5N5', room => {
			const creeps = room['#lookFor'](C.LOOK_CREEPS);
			const tombstones = room['#lookFor'](C.LOOK_TOMBSTONES);
			assert.strictEqual(creeps.filter(c => c.name.startsWith('Keeper')).length, 0, 'keeper should be dead');
			assert.strictEqual(tombstones.length, 1, 'tombstone should exist');
		});

		// The room must have a scheduled wake so the tombstone gets cleaned up
		// and the keeper lair can start its respawn timer.
		const active = await shard.scratch.zscore(activeRoomsKey, 'W5N5');
		const sleeping = await shard.scratch.zscore('processor/inactiveRooms', 'W5N5');
		assert(active !== null || sleeping !== null,
			'room should have a scheduled wake after keeper death (issue #58)');
	}));

	test('tombstone is cleaned up within decay window', () => keeperRoom(async ({ shard, tick, peekRoom }) => {
		await shard.scratch.zadd(activeRoomsKey, [ [ 0, 'W5N5' ] ]);

		// Tick 1: keeper alive
		// Tick 2: keeper dies, tombstone created
		await tick(2);

		// Tombstone decay for 50-part keeper = 250 ticks.
		// Tick enough to pass the decay window. The room should wake and clean
		// up the tombstone at some point during these ticks.
		await tick(C.TOMBSTONE_DECAY_PER_PART * keeperBody.length + 10);

		await peekRoom('W5N5', room => {
			const tombstones = room['#lookFor'](C.LOOK_TOMBSTONES);
			assert.strictEqual(tombstones.length, 0,
				'tombstone should be cleaned up after decay window');
		});
	}));

	test('keeper lair starts respawn timer after keeper death', () => keeperRoom(async ({ shard, tick, peekRoom }) => {
		await shard.scratch.zadd(activeRoomsKey, [ [ 0, 'W5N5' ] ]);

		// Tick 1: keeper alive. Tick 2: keeper dies.
		await tick(2);

		// Tick a few more so the lair has a chance to detect the missing keeper
		await tick(3);

		await peekRoom('W5N5', room => {
			const lairs = room['#lookFor'](C.LOOK_STRUCTURES)
				.filter((s: any) => s.structureType === C.STRUCTURE_KEEPER_LAIR);
			assert.strictEqual(lairs.length, 1, 'keeper lair should exist');
			const lair = lairs[0] as any;
			assert(lair['#nextSpawnTime'] > 0,
				'keeper lair should have started respawn timer after keeper death');
		});
	}));

	// Edge case: creep dies on its very first processed tick. The creep's own
	// wakeAt(ageTime) never fires (it returns before line 317 on death), and
	// the tombstone's Tick processor is skipped (newly inserted object). If
	// nothing else schedules a wake, the room sleeps forever and the tombstone
	// is never cleaned up.
	const firstTickDeath = simulate({
		W4N4: room => {
			const creep = createCreep(new RoomPosition(25, 25, 'W4N4'), [ C.MOVE ], 'ephemeral', '3');
			// Dies on the very first tick (Game.time=2 >= ageTime=2)
			creep['#ageTime'] = 2;
			room['#insertObject'](creep);
		},
	});

	test('tombstone from first-tick death schedules decay wake', () => firstTickDeath(async ({ shard, tick, peekRoom }) => {
		await shard.scratch.zadd(activeRoomsKey, [ [ 0, 'W4N4' ] ]);

		// Creep dies immediately on first tick
		await tick();

		await peekRoom('W4N4', room => {
			const tombstones = room['#lookFor'](C.LOOK_TOMBSTONES);
			assert.strictEqual(tombstones.length, 1, 'tombstone should exist');
		});

		// Room should have a scheduled wake for tombstone decay cleanup.
		// Decay for 1-part creep = 5 ticks, so wake should be at Game.time + 5.
		const active = await shard.scratch.zscore(activeRoomsKey, 'W4N4');
		const sleeping = await shard.scratch.zscore('processor/inactiveRooms', 'W4N4');
		assert(active !== null || sleeping !== null,
			'room should schedule a wake for tombstone decay (first-tick death edge case)');
	}));

	test('first-tick tombstone is eventually cleaned up', () => firstTickDeath(async ({ shard, tick, peekRoom }) => {
		await shard.scratch.zadd(activeRoomsKey, [ [ 0, 'W4N4' ] ]);

		await tick();

		// Tick past the decay window (5 ticks for 1-part creep + buffer)
		await tick(10);

		await peekRoom('W4N4', room => {
			const tombstones = room['#lookFor'](C.LOOK_TOMBSTONES);
			assert.strictEqual(tombstones.length, 0,
				'tombstone should be cleaned up after decay window (first-tick death)');
		});
	}));
});
