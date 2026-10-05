import type { Shard } from 'xxscreeps/engine/db/index.js';
import { activeRoomsKey } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { StructurePortal, create } from 'xxscreeps/mods/portal/portal.js';
import { generateRoom } from 'xxscreeps/scripts/room-gen.js';
import { DeterministicClockForTesting, deterministicRandomForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { sweepTimesForTesting } from './model.js';

// The seeded schedule is due at once. Each sweep takes a tick, and one more lands the intents it pushes.
function firstSweep(tick: (count: number) => Promise<void>) {
	return tick(2);
}

// Later sweeps come due on the wall clock, if the schedule holds one by then.
function sweepAfter(clock: DeterministicClockForTesting, tick: (count: number) => Promise<void>, elapsed: number) {
	clock.increment(elapsed);
	return tick(2);
}

// The test world is the single sector around W5N5; the rest of these center rooms are generated
// beside it. Generation saves one room buffer, where a server's boot fills both.
const kSectors = [ 5, 15, 25, 35 ].flatMap(yy => [ 5, 15, 25, 35 ].map(xx => `W${xx}N${yy}`));
function withSectors(count: number) {
	const centers = kSectors.slice(0, count);
	const simulation = simulate({}, async shard => {
		// One room at a time: each generation rewrites the whole terrain blob, so concurrent ones would
		// drop each other's rooms.
		for (const roomName of Fn.reject(centers, name => name === 'W5N5')) {
			await generateRoom(shard, roomName);
			await shard.copyRoomFromPreviousTick(roomName, shard.time + 1);
		}
	});
	const loadPortalRooms = async (shard: Shard) => {
		const rooms = await Fn.mapAwait(centers, roomName => shard.loadRoom(roomName));
		return rooms.filter(room => room['#objects'].some(instanceOfPredicate(StructurePortal)));
	};
	return { loadPortalRooms, simulation };
}

describe('mods/mmo/portal', () => {
	const seven = withSectors(7);
	test('a world under eight center rooms holds no portals', () => seven.simulation(async ({ shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		await firstSweep(tick);
		assert.strictEqual((await seven.loadPortalRooms(shard)).length, 0);
		// With no pair ever owed there is nothing to sweep for
		assert.deepStrictEqual(await sweepTimesForTesting(shard), []);
	}));

	const eight = withSectors(8);
	test('places one reciprocal pair of stable portals', () => eight.simulation(async ({ peekRoom, shard, tick, world }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		await firstSweep(tick);
		const portalRooms = await eight.loadPortalRooms(shard);
		assert.strictEqual(portalRooms.length, 2);
		const [ first, second ] = portalRooms;
		assert.ok(first && second);
		for (const [ room, partner ] of [ [ first, second ], [ second, first ] ] as const) {
			const portals = lookForStructures(room, C.STRUCTURE_PORTAL);
			// Eight structures around an open placement position, off wall
			assert.strictEqual(portals.length, 8);
			const eye = new RoomPosition(
				Math.min(...Fn.map(portals, structure => structure.pos.x)) + 1,
				Math.min(...Fn.map(portals, structure => structure.pos.y)) + 1,
				room.name);
			assert.ok(portals.every(structure => structure.pos.inRangeTo(eye, 1) && !structure.pos.isEqualTo(eye)));
			const terrain = world.map.getRoomTerrain(room.name);
			assert.ok(portals.every(structure => terrain.get(structure.pos.x, structure.pos.y) !== C.TERRAIN_MASK_WALL));
			// Each structure leads onto the partner's structure that leads back to it
			const partnerPortals = lookForStructures(partner, C.STRUCTURE_PORTAL);
			for (const structure of portals) {
				const { destination } = structure;
				assert.ok(destination instanceof RoomPosition);
				const counterpart = partnerPortals.find(other => other.pos.isEqualTo(destination));
				assert.ok(counterpart?.destination instanceof RoomPosition);
				assert.ok(counterpart.destination.isEqualTo(structure.pos));
			}
			await peekRoom(room.name, room => {
				assert.ok(lookForStructures(room, C.STRUCTURE_PORTAL).every(portal => portal.ticksToDecay === undefined));
			});
		}
		// Both portals share one stable window, starting now
		const unstableTimes = Fn.pipe(
			portalRooms,
			$$ => Fn.transform($$, room => lookForStructures(room, C.STRUCTURE_PORTAL)),
			$$ => Fn.map($$, portal => portal['#unstableTime']),
			$$ => new Set($$));
		assert.strictEqual(unstableTimes.size, 1);
		const [ unstableTime ] = unstableTimes;
		assert.ok(unstableTime !== undefined && Math.abs(unstableTime - C.PORTAL_UNSTABLE - Date.now()) < 60_000);
	}));

	test('a world at its target next sweeps when its pair\'s window passes', () => eight.simulation(async ({ shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting({ step: 0 });
		await firstSweep(tick);
		assert.strictEqual((await eight.loadPortalRooms(shard)).length, 2);
		assert.deepStrictEqual(await sweepTimesForTesting(shard), [ Date.now() + C.PORTAL_UNSTABLE ]);
	}));

	const sixteen = withSectors(16);
	test('each pair waits for its share of the stable window', () => sixteen.simulation(async ({ shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		await firstSweep(tick);
		assert.strictEqual((await sixteen.loadPortalRooms(shard)).length, 2);
		// Sixteen center rooms earn two pairs, so the second waits half the window
		await sweepAfter(clock, tick, C.PORTAL_UNSTABLE / 2 - 60_000);
		assert.strictEqual((await sixteen.loadPortalRooms(shard)).length, 2);
		await sweepAfter(clock, tick, 60_000);
		assert.strictEqual((await sixteen.loadPortalRooms(shard)).length, 4);
	}));

	test('both portals of a pair start to decay together once their window passes', () => eight.simulation(async ({ peekRoom, shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		await firstSweep(tick);
		const portalRooms = await eight.loadPortalRooms(shard);
		assert.strictEqual(portalRooms.length, 2);

		// Nothing comes due inside the window, which leaves both portals stable
		await sweepAfter(clock, tick, C.PORTAL_UNSTABLE - 60_000);
		for (const room of portalRooms) {
			await peekRoom(room.name, room => {
				assert.ok(lookForStructures(room, C.STRUCTURE_PORTAL).every(portal => portal.ticksToDecay === undefined));
			});
		}

		// The sweep due as it passes starts every structure of both portals on the same tick
		await sweepAfter(clock, tick, 60_000);
		for (const room of portalRooms) {
			await peekRoom(room.name, room => {
				assert.ok(lookForStructures(room, C.STRUCTURE_PORTAL).every(portal => portal.ticksToDecay === C.PORTAL_DECAY - 1));
			});
		}
		// The pair is replaced once it has gone, which no wall-clock deadline marks
		assert.deepStrictEqual(await sweepTimesForTesting(shard), []);
	}));

	test('a portal finishing its decay wakes the sweep to replace its pair', () => eight.simulation(async ({ poke, shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		// A pair already on its way out fills the world's target. A server's boot processes every room
		// once, which is what leaves these awake for the tick their portals go.
		const decaying = [ [ 'W5N5', 'W15N5' ], [ 'W15N5', 'W5N5' ] ] as const;
		for (const [ roomName, partner ] of decaying) {
			await poke(roomName, undefined, (Game, room) => {
				room['#insertObject'](create(new RoomPosition(25, 25, roomName), new RoomPosition(25, 25, partner), Game.time + 4));
			});
			await Promise.all([
				shard.copyRoomFromPreviousTick(roomName, shard.time + 1),
				shard.scratch.zAdd(activeRoomsKey, [ [ 0, roomName ] ]),
			]);
		}
		await firstSweep(tick);
		assert.strictEqual((await eight.loadPortalRooms(shard)).length, 2);
		assert.deepStrictEqual(await sweepTimesForTesting(shard), []);
		// It goes on the next tick, whose sweep places the replacement, and one more tick lands it
		await tick(3);
		const portalRooms = await eight.loadPortalRooms(shard);
		assert.strictEqual(portalRooms.length, 2);
		assert.ok(portalRooms.every(room => lookForStructures(room, C.STRUCTURE_PORTAL).every(portal => portal['#unstableTime'] !== 0)));
	}));
});
