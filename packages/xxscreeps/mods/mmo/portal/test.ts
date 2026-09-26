import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { StructurePortal } from 'xxscreeps/mods/portal/portal.js';
import { kUnstableCheckInterval } from 'xxscreeps/mods/portal/processor.js';
import { generateRoom } from 'xxscreeps/scripts/room-gen.js';
import { DeterministicClockForTesting, deterministicRandomForTesting } from 'xxscreeps/test/fixtures.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { kSweepInterval } from './main.js';

const portalsIn = (room: Room) => room['#objects'].filter(instanceOfPredicate(StructurePortal));

// Ticks through the next sweep, and one more so the intents it pushes land.
function tickPastSweep(shard: Shard, tick: (count: number) => Promise<void>) {
	return tick((kSweepInterval - shard.time % kSweepInterval) % kSweepInterval + 2);
}

// The test world is the single sector around W5N5; the rest of these center rooms are generated
// beside it. Generation saves one room buffer, where a server's boot fills both.
const kCenters = [ 5, 15, 25, 35 ].flatMap(yy => [ 5, 15, 25, 35 ].map(xx => `W${xx}N${yy}`));
function withCenters(count: number) {
	const centers = kCenters.slice(0, count);
	const simulation = simulate({}, async shard => {
		for (const roomName of Fn.reject(centers, name => name === 'W5N5')) {
			await generateRoom(shard, roomName);
			await shard.copyRoomFromPreviousTick(roomName, shard.time + 1);
		}
	});
	const loadRings = async (shard: Shard) => {
		const rooms = await Fn.mapAwait(centers, roomName => shard.loadRoom(roomName));
		return rooms.filter(room => room['#objects'].some(instanceOfPredicate(StructurePortal)));
	};
	return { loadRings, simulation };
}

describe('mods/mmo/portal', () => {
	const seven = withCenters(7);
	test('a world under eight center rooms holds no portals', () => seven.simulation(async ({ shard, tick }) => {
		using rng = deterministicRandomForTesting();
		await tickPastSweep(shard, tick);
		await tickPastSweep(shard, tick);
		assert.strictEqual((await seven.loadRings(shard)).length, 0);
	}));

	const eight = withCenters(8);
	test('places one reciprocal pair of stable rings', () => eight.simulation(async ({ peekRoom, shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		await tickPastSweep(shard, tick);
		const rings = await eight.loadRings(shard);
		assert.strictEqual(rings.length, 2);
		const [ first, second ] = rings;
		assert.ok(first && second);
		const world = await shard.loadWorld();
		for (const [ room, partner ] of [ [ first, second ], [ second, first ] ] as const) {
			const ring = portalsIn(room);
			// A 3x3 ring of eight around an open centre, off wall
			assert.strictEqual(ring.length, 8);
			const center = new RoomPosition(
				Math.min(...ring.map(portal => portal.pos.x)) + 1,
				Math.min(...ring.map(portal => portal.pos.y)) + 1,
				room.name);
			assert.ok(ring.every(portal => portal.pos.inRangeTo(center, 1) && !portal.pos.isEqualTo(center)));
			const terrain = world.map.getRoomTerrain(room.name);
			assert.ok(ring.every(portal => terrain.get(portal.pos.x, portal.pos.y) !== C.TERRAIN_MASK_WALL));
			// Each portal leads onto the partner portal that leads back to it
			const partnerRing = portalsIn(partner);
			for (const portal of ring) {
				const destination = portal.destination;
				assert.ok(destination instanceof RoomPosition);
				const counterpart = partnerRing.find(other => other.pos.isEqualTo(destination));
				assert.ok(counterpart?.destination instanceof RoomPosition);
				assert.ok(counterpart.destination.isEqualTo(portal.pos));
			}
			await peekRoom(room.name, room => {
				assert.ok(portalsIn(room).every(portal => portal.ticksToDecay === undefined));
			});
		}
		// Both rings share one stable window, starting now
		const unstableTimes = new Set(Fn.transform(rings, room => Fn.map(portalsIn(room), portal => portal['#unstableTime'])));
		assert.strictEqual(unstableTimes.size, 1);
		const [ unstableTime ] = unstableTimes;
		assert.ok(unstableTime !== undefined && Math.abs(unstableTime - C.PORTAL_UNSTABLE - Date.now()) < 60_000);
	}));

	test('a world at its target places no more', () => eight.simulation(async ({ shard, tick }) => {
		using rng = deterministicRandomForTesting();
		await tickPastSweep(shard, tick);
		await tickPastSweep(shard, tick);
		assert.strictEqual((await eight.loadRings(shard)).length, 2);
	}));

	const sixteen = withCenters(16);
	test('each pair waits for its share of the stable window', () => sixteen.simulation(async ({ shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		await tickPastSweep(shard, tick);
		assert.strictEqual((await sixteen.loadRings(shard)).length, 2);
		await tickPastSweep(shard, tick);
		assert.strictEqual((await sixteen.loadRings(shard)).length, 2);
		// Sixteen center rooms earn two pairs, so the second waits half the window
		clock.increment(C.PORTAL_UNSTABLE / 2);
		await tickPastSweep(shard, tick);
		assert.strictEqual((await sixteen.loadRings(shard)).length, 4);
	}));

	test('both rings of a pair decay together once their window passes', () => eight.simulation(async ({ peekRoom, poke, shard, tick }) => {
		using rng = deterministicRandomForTesting();
		using clock = new DeterministicClockForTesting();
		await tickPastSweep(shard, tick);
		const rings = await eight.loadRings(shard);
		assert.strictEqual(rings.length, 2);
		// A creep keeps one ring's room processing every tick; the other only wakes to check the clock
		const [ awake ] = rings;
		assert.ok(awake);
		const ring = portalsIn(awake);
		const center = new RoomPosition(
			Math.min(...ring.map(portal => portal.pos.x)) + 1,
			Math.min(...ring.map(portal => portal.pos.y)) + 1,
			awake.name);
		await poke(awake.name, '100', (_Game, room) => {
			room['#insertObject'](createCreep(center, [ C.MOVE ], 'parker', '100'));
		});

		clock.increment(C.PORTAL_UNSTABLE - 60_000);
		await tick(kUnstableCheckInterval);
		for (const room of rings) {
			await peekRoom(room.name, room => {
				assert.ok(portalsIn(room).every(portal => portal.ticksToDecay === undefined));
			});
		}

		clock.increment(120_000);
		await tick(kUnstableCheckInterval);
		const decayTimes = new Set(Fn.transform(await eight.loadRings(shard), room => Fn.map(portalsIn(room), portal => portal['#decayTime'])));
		assert.strictEqual(decayTimes.size, 1);
		assert.ok(!decayTimes.has(0));
	}));
});
