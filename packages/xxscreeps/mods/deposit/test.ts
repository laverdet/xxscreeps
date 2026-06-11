import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { PartType } from 'xxscreeps/mods/creep/creep.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { sectorContainsTile, sectorEdgeRooms } from 'xxscreeps/game/room/sector.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { DEPOSIT_DECAY_TIME, DEPOSIT_EXHAUST_MULTIPLY, DEPOSIT_EXHAUST_POW } from 'xxscreeps/mods/mineral/constants.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { Deposit } from './deposit.js';
import { depositTypeForRoom, inspectDueSectorsForTest, markBootstrappedForTest, scheduleSector, setDepositBootstrapScatterForTest, setDepositSpawnRng } from './spawn.js';

interface DepositSimOptions {
	body?: PartType[];
	cooldownTicks?: number;
	decayTicks?: number;
	harvested?: number;
}

function createDeposit(pos: RoomPosition, depositType: ResourceType, harvested: number, nextDecayTime: number) {
	const deposit = RoomObject.create(new Deposit(), pos);
	deposit.depositType = depositType;
	deposit['#harvested'] = harvested;
	deposit['#cooldownTime'] = 0;
	deposit.lastCooldown = 0;
	deposit['#nextDecayTime'] = nextDecayTime;
	return deposit;
}

function cooldown(harvested: number) {
	return Math.ceil(DEPOSIT_EXHAUST_MULTIPLY * harvested ** DEPOSIT_EXHAUST_POW);
}

function depositSim(options: DepositSimOptions = {}) {
	return simulate({
		W1N1: room => {
			const deposit = createDeposit(
				new RoomPosition(25, 25, 'W1N1'),
				C.RESOURCE_SILICON,
				options.harvested ?? 0,
				Game.time + (options.decayTicks ?? 100),
			);
			deposit['#cooldownTime'] = options.cooldownTicks === undefined ? 0 : Game.time + options.cooldownTicks;
			room['#insertObject'](deposit);
			room['#insertObject'](createCreep(
				new RoomPosition(25, 26, 'W1N1'),
				options.body ?? [ C.WORK, C.CARRY, C.MOVE ],
				'harvester',
				'100'));
		},
	});
}

describe('Deposit', () => {
	test('harvest stores resources and updates cooldown curve', () => depositSim({
		body: [ C.WORK, C.WORK, C.WORK, C.CARRY, C.MOVE ],
		harvested: 997,
	})(async ({ player, poke, tick }) => {
		await player('100', Game => {
			const deposit = Game.rooms.W1N1!.find(C.FIND_DEPOSITS)[0]!;
			assert.strictEqual(Game.creeps.harvester?.harvest(deposit), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.harvester?.store[C.RESOURCE_SILICON], 3);
		});
		await poke('W1N1', '100', (_Game, room) => {
			const deposit = room['#lookFor'](C.LOOK_DEPOSITS)[0];
			assert.strictEqual(deposit?.lastCooldown, cooldown(1000));
			assert.strictEqual(deposit.cooldown, cooldown(1000));
		});
	}));

	test('harvest returns ERR_TIRED while cooling', () => depositSim({
		cooldownTicks: 1000,
	})(async ({ player, tick }) => {
		await player('100', Game => {
			const deposit = Game.rooms.W1N1!.find(C.FIND_DEPOSITS)[0]!;
			assert.strictEqual(Game.creeps.harvester?.harvest(deposit), C.ERR_TIRED);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.harvester?.store[C.RESOURCE_SILICON], 0);
		});
	}));

	test('deposit is deleted when decay time expires', () => depositSim({
		decayTicks: 2,
	})(async ({ player, tick }) => {
		await tick(2);
		await player('100', Game => {
			assert.strictEqual(Game.rooms.W1N1?.find(C.FIND_DEPOSITS).length, 0);
		});
	}));

	test('harvest refreshes decay time', () => depositSim({
		decayTicks: 5,
	})(async ({ player, tick }) => {
		await player('100', Game => {
			const deposit = Game.rooms.W1N1!.find(C.FIND_DEPOSITS)[0]!;
			assert.strictEqual(Game.creeps.harvester?.harvest(deposit), C.OK);
		});
		await tick();
		await player('100', Game => {
			const deposit = Game.rooms.W1N1!.find(C.FIND_DEPOSITS)[0];
			assert.strictEqual(deposit?.ticksToDecay, DEPOSIT_DECAY_TIME);
		});
	}));
});

// Tiny LCG so tests pick rooms/tiles deterministically. Re-seeded by `withFixedSpawnRng`.
function makeRng(seed = 1): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

// Scope a deterministic RNG (and a zero-scatter bootstrap) to the test; restores defaults on
// disposal. Disabling scatter keeps the single-sector test world firing on tick 1.
function withFixedSpawnRng(seed = 1): Disposable {
	setDepositSpawnRng(makeRng(seed));
	setDepositBootstrapScatterForTest(() => 0);
	return {
		[Symbol.dispose]() {
			setDepositSpawnRng(undefined);
			setDepositBootstrapScatterForTest(undefined);
		},
	};
}

async function findDepositsInSector(shard: Shard, centralRoom: string) {
	const out: { roomName: string; deposit: Deposit }[] = [];
	for (const edgeRoom of sectorEdgeRooms(centralRoom)) {
		const room = await shard.loadRoom(edgeRoom).catch(() => undefined);
		if (!room) continue;
		for (const object of room['#objects']) {
			if (object instanceof Deposit) {
				out.push({ roomName: edgeRoom, deposit: object });
			}
		}
	}
	return out;
}

// All test world rooms (W0..W10 × N0..N10) carry the sector W5N5 — the only central room.
// Each `tick()` runs the shard tick processor once, which can place at most one deposit.
const emptySector = simulate({});

describe('Deposit spawn', () => {
	test('seeds a deposit on first tick below threshold', () => emptySector(async ({ shard, tick }) => {
		using _rng = withFixedSpawnRng();
		assert.strictEqual((await findDepositsInSector(shard, 'W5N5')).length, 0);
		// Tick 1: bootstrap queues W5N5; evaluator picks a candidate and pushes a spawn intent.
		// Tick 2: room processor receives the intent and inserts the Deposit.
		await tick(2);
		const found = await findDepositsInSector(shard, 'W5N5');
		assert.strictEqual(found.length, 1, 'exactly one deposit per evaluator pass');
		const { roomName, deposit } = found[0]!;
		// Round-trip: the type survives intent serialization and the schema enum write/read.
		assert.strictEqual(deposit.depositType, depositTypeForRoom(roomName));
		assert.strictEqual(deposit['#nextDecayTime'], shard.time + DEPOSIT_DECAY_TIME);
		// Ported placement predicates: wall terrain, inside the sector's 250-tile radius.
		const world = await shard.loadWorld();
		const terrain = world.map.getRoomTerrain(roomName);
		assert.ok((terrain.get(deposit.pos.x, deposit.pos.y) & C.TERRAIN_MASK_WALL) !== 0,
			'deposit spawns on wall terrain');
		assert.ok(sectorContainsTile('W5N5', roomName)(deposit.pos.x, deposit.pos.y),
			'deposit spawns inside the sector radius');
	}));

	test('saturated sector does not spawn more', () => emptySector(async ({ shard, tick }) => {
		using _rng = withFixedSpawnRng();
		// Throughput from one fresh deposit (harvested=0): 20/max(1, M·0^P) = 20. Single
		// deposit blows past the 2.5 threshold, so re-evaluation should stop spawning.
		await tick(2); // first deposit spawns
		const afterSpawn = await findDepositsInSector(shard, 'W5N5');
		assert.strictEqual(afterSpawn.length, 1);
		// Force a sector re-eval by bumping its score down to 0 (= due immediately). The
		// production cadence is the 5-minute wall-clock ceiling, but `{ earliest: true }`
		// matches the decay-path's bump-down semantics.
		await scheduleSector(shard, 'W5N5', 0, { earliest: true });
		await tick(2);
		const afterReeval = await findDepositsInSector(shard, 'W5N5');
		assert.strictEqual(afterReeval.length, 1, 'saturated sector should not gain a second deposit');
	}));

	// Every ring room but one holds a heavily-harvested deposit: 39 × 20/(0.001·50000^1.2)
	// ≈ 1.8 total throughput keeps the sector below the 2.5 target, so the evaluator spawns
	// again — and the busy-room exclusion leaves it exactly one legal destination. The four
	// candidate spots cover each room's in-radius quadrant, whichever side of the sector it
	// sits on.
	const freeRoom = 'W0N5';
	const occupiedRing = Object.fromEntries(sectorEdgeRooms('W5N5')
		.filter(name => name !== freeRoom)
		.map(name => [ name, (room: Room) => {
			const inSector = sectorContainsTile('W5N5', name);
			const spot = [ [ 20, 20 ], [ 20, 30 ], [ 30, 20 ], [ 30, 30 ] ]
				.find(([ xx, yy ]) => inSector(xx!, yy!))!;
			room['#insertObject'](createDeposit(
				new RoomPosition(spot[0]!, spot[1]!, name),
				C.RESOURCE_SILICON,
				50_000,
				Game.time + DEPOSIT_DECAY_TIME,
			));
		} ]));

	test('occupied rooms are excluded from spawn candidates', () => simulate(occupiedRing)(async ({ shard, tick }) => {
		using _rng = withFixedSpawnRng();
		await markBootstrappedForTest(shard);
		await scheduleSector(shard, 'W5N5', 0, { earliest: true });
		await tick(2);
		const found = await findDepositsInSector(shard, 'W5N5');
		assert.strictEqual(found.length, 40);
		assert.strictEqual(found.filter(({ roomName }) => roomName === freeRoom).length, 1,
			'the only free room receives the spawn');
	}));

	test('decay prompts an immediate re-eval and refill', () => simulate({
		// Plant a decayable deposit on the W5N5 sector edge, inside the sector's 250-tile
		// radius (for W0N0 that's the x,y < 24 quadrant facing the central room). A
		// player-owned creep keeps the room active so its tick processor (and therefore the
		// deposit's decay path) runs.
		W0N0: room => {
			const deposit = createDeposit(
				new RoomPosition(20, 20, 'W0N0'),
				C.RESOURCE_SILICON,
				0,
				Game.time + 1, // decays at the end of next tick
			);
			room['#insertObject'](deposit);
			room['#insertObject'](createCreep(
				new RoomPosition(20, 21, 'W0N0'), [ C.MOVE ], 'parker', '100'));
		},
	})(async ({ shard, tick }) => {
		using _rng = withFixedSpawnRng();
		// Skip the bootstrap seed so the decay path is the sole scheduler of W5N5.
		await markBootstrappedForTest(shard);

		// Decay fires during this tick and marks W5N5 due immediately (score 0); the shard
		// processor drains it the same tick, tallies the sector without the corpse, and pushes
		// a refill intent. The surviving due entry is the cadence reschedule.
		await tick(1);
		const due = await inspectDueSectorsForTest(shard);
		assert.strictEqual(due.length, 1);
		assert.strictEqual(due[0]![1], 'W5N5');
		// The refill intent lands next tick.
		await tick(1);
		assert.strictEqual((await findDepositsInSector(shard, 'W5N5')).length, 1);
	}));

	test('decay outside the sector radius schedules nothing', () => simulate({
		// Official placement doesn't enforce the 250-tile radius, so out-of-radius deposits
		// exist in the wild. They're invisible to every sector's throughput tally, so their
		// decay must not prompt a re-eval.
		W0N0: room => {
			const deposit = createDeposit(
				new RoomPosition(30, 30, 'W0N0'), // outside W5N5's 250-tile radius
				C.RESOURCE_SILICON,
				0,
				Game.time + 1,
			);
			room['#insertObject'](deposit);
			room['#insertObject'](createCreep(
				new RoomPosition(30, 31, 'W0N0'), [ C.MOVE ], 'parker', '100'));
		},
	})(async ({ shard, tick }) => {
		using _rng = withFixedSpawnRng();
		await markBootstrappedForTest(shard);
		await tick(1);
		assert.deepStrictEqual(await inspectDueSectorsForTest(shard), []);
	}));
});
