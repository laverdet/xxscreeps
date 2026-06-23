import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { PartType } from 'xxscreeps/mods/creep/creep.js';
import { runShardInitializers } from 'xxscreeps/engine/processor/shard.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition, positionsInRangeTo } from 'xxscreeps/game/position.js';
import { isHighwayRoom } from 'xxscreeps/game/room/sector.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { deterministicRandomForTesting } from 'xxscreeps/utility/utility.js';
import { inspectDuePowerBankRoomsForTest, scheduleRoom } from './place.js';
import { StructurePowerBank, create as createPowerBank } from './powerbank.js';

interface PowerBankSimOptions {
	body?: PartType[];
	decayTicks?: number;
	hits?: number;
}

const bankPower = 1000;

function powerBankSim(options: PowerBankSimOptions = {}) {
	return simulate({
		W1N1: room => {
			const bank = createPowerBank(new RoomPosition(25, 25, 'W1N1'), bankPower);
			bank['#nextDecayTime'] = Game.time + (options.decayTicks ?? 100);
			if (options.hits !== undefined) {
				bank.hits = options.hits;
			}
			room['#insertObject'](bank);
			room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), options.body ?? [ C.ATTACK ], 'attacker', '100'));
		},
	});
}

describe('PowerBank', () => {
	test('surface is hostile and rejects transfer & withdraw', () => powerBankSim()(async ({ player }) => {
		await player('100', Game => {
			const room = Game.rooms.W1N1!;
			const bank = lookForStructures(room, C.STRUCTURE_POWER_BANK)[0]!;
			assert.strictEqual(bank.power, bankPower);
			assert.strictEqual(bank.store[C.RESOURCE_POWER], bankPower);
			assert.strictEqual(bank.hits, C.POWER_BANK_HITS);
			assert.strictEqual(bank.hitsMax, C.POWER_BANK_HITS);
			assert.strictEqual(bank.my, false);
			assert.strictEqual(bank.owner.username, 'Power Bank');
			assert.strictEqual(room.find(C.FIND_HOSTILE_STRUCTURES)[0]?.id, bank.id);
			const attacker = Game.creeps.attacker!;
			assert.strictEqual(attacker.withdraw(bank, C.RESOURCE_POWER), C.ERR_INVALID_TARGET);
			assert.strictEqual(attacker.transfer(bank, C.RESOURCE_POWER), C.ERR_INVALID_TARGET);
		});
	}));

	test('decays silently without a ruin or dropped power', () => powerBankSim({
		decayTicks: 2,
	})(async ({ player, tick }) => {
		await tick(2);
		await player('100', Game => {
			const room = Game.rooms.W1N1!;
			assert.strictEqual(lookForStructures(room, C.STRUCTURE_POWER_BANK).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_RUINS).length, 0);
			assert.strictEqual(room['#lookFor'](C.LOOK_RESOURCES).length, 0);
		});
	}));

	test('melee attack reflects damage', () => powerBankSim()(async ({ player, tick }) => {
		await player('100', Game => {
			const bank = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_BANK)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(bank), C.OK);
		});
		await tick();
		await player('100', Game => {
			const room = Game.rooms.W1N1!;
			const bank = lookForStructures(room, C.STRUCTURE_POWER_BANK)[0]!;
			const attacker = Game.creeps.attacker!;
			assert.strictEqual(bank.hits, C.POWER_BANK_HITS - C.ATTACK_POWER);
			assert.strictEqual(attacker.hits, 100 - C.ATTACK_POWER * C.POWER_BANK_HIT_BACK);
			const hitBack = room.getEventLog().find(event =>
				event.event === C.EVENT_ATTACK && event.data?.attackType === C.EVENT_ATTACK_TYPE_HIT_BACK);
			assert.ok(hitBack, 'expected a hit-back attack event');
			assert.strictEqual(hitBack.objectId, bank.id);
			assert.ok(hitBack.data, 'expected nested data payload');
			assert.strictEqual(hitBack.data.targetId, attacker.id);
			assert.strictEqual(hitBack.data.damage, C.ATTACK_POWER * C.POWER_BANK_HIT_BACK);
		});
	}));

	test('ranged attack reflects damage', () => powerBankSim({
		body: [ C.RANGED_ATTACK ],
	})(async ({ player, tick }) => {
		await player('100', Game => {
			const bank = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_BANK)[0]!;
			assert.strictEqual(Game.creeps.attacker?.rangedAttack(bank), C.OK);
		});
		await tick();
		await player('100', Game => {
			const bank = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_BANK)[0]!;
			assert.strictEqual(bank.hits, C.POWER_BANK_HITS - C.RANGED_ATTACK_POWER);
			assert.strictEqual(Game.creeps.attacker?.hits, 100 - C.RANGED_ATTACK_POWER * C.POWER_BANK_HIT_BACK);
		});
	}));

	test('killing blow leaves a lootable ruin and still reflects', () => powerBankSim({
		hits: 10,
	})(async ({ player, tick }) => {
		await player('100', Game => {
			const bank = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_POWER_BANK)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(bank), C.OK);
		});
		await tick();
		await player('100', Game => {
			const room = Game.rooms.W1N1!;
			assert.strictEqual(lookForStructures(room, C.STRUCTURE_POWER_BANK).length, 0);
			const ruin = room['#lookFor'](C.LOOK_RUINS)[0]!;
			assert.strictEqual(ruin.store[C.RESOURCE_POWER], bankPower);
			assert.strictEqual(ruin.ticksToDecay, C.RUIN_DECAY_STRUCTURES.powerBank);
			assert.strictEqual(ruin.structureType, C.STRUCTURE_POWER_BANK);
			assert.strictEqual(Game.creeps.attacker?.hits, 100 - C.ATTACK_POWER * C.POWER_BANK_HIT_BACK);
			const log = room.getEventLog();
			assert.ok(log.some(event =>
				event.event === C.EVENT_OBJECT_DESTROYED && event.objectId === ruin.structure.id));
			assert.ok(log.some(event =>
				event.event === C.EVENT_ATTACK && event.data?.attackType === C.EVENT_ATTACK_TYPE_HIT_BACK));
		});
	}));
});

// Scripted values for the first calls, then the LCG — steers the base/crit rolls while leaving
// placement free to vary.
function makeRngWithPrefix(prefix: number[], seed = 1) {
	const disposable = deterministicRandomForTesting(seed);
	const { random } = Math;
	let index = 0;
	Math.random = () => index < prefix.length ? prefix[index++]! : random();
	return disposable;
}

async function findPowerBank(shard: Shard, roomName: string): Promise<StructurePowerBank | undefined> {
	const room = await shard.loadRoom(roomName);
	return Fn.find(room['#objects'], instanceOfPredicate(StructurePowerBank));
}

const emptyWorld = simulate({});

describe('PowerBank placement', () => {
	test('bootstrap seeds every highway room without placing', () => emptyWorld(async ({ shard }) => {
		using rng = deterministicRandomForTesting();
		const seededAt = shard.time;
		await runShardInitializers(shard);
		const due = await inspectDuePowerBankRoomsForTest(shard);
		assert.ok(due.length > 0, 'highway rooms were seeded');
		for (const [ score, roomName ] of due) {
			assert.ok(isHighwayRoom(roomName), `${roomName} should be a highway room`);
			const ahead = score - seededAt;
			assert.ok(ahead >= C.POWER_BANK_RESPAWN_TIME * 0.75 && ahead <= C.POWER_BANK_RESPAWN_TIME * 1.25,
				`${roomName} scheduled ${ahead} ticks ahead`);
		}
		assert.ok(due.some(([ , roomName ]) => roomName === 'W0N0'), 'W0N0 is a seeded highway room');
		// First touch seeds the timer but places nothing.
		assert.strictEqual(await findPowerBank(shard, 'W0N0'), undefined);
	}));

	test('a due highway room places one valid power bank', () => emptyWorld(async ({ shard, tick }) => {
		using rng = deterministicRandomForTesting();
		const scheduledAt = shard.time;
		await scheduleRoom(shard, 'W0N0', 0);
		// Tick 1: the shard processor pushes a placement intent and reschedules. Tick 2: the room
		// processor receives the intent and inserts the bank.
		await tick(2);
		const bank = await findPowerBank(shard, 'W0N0');
		assert.ok(bank, 'a power bank was placed in the due room');
		// Placement: a wall position in 5..44 with at least one non-wall neighbour.
		const world = await shard.loadWorld();
		const terrain = world.map.getRoomTerrain('W0N0');
		assert.ok(bank.pos.x >= 5 && bank.pos.x <= 44 && bank.pos.y >= 5 && bank.pos.y <= 44, 'position within 5..44');
		assert.ok(terrain.get(bank.pos.x, bank.pos.y) === C.TERRAIN_MASK_WALL, 'placed on wall terrain');
		const hasExit = Fn.some(positionsInRangeTo(bank.pos, 1), pos => terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL);
		assert.ok(hasExit, 'placed next to a non-wall position');
		// Object fidelity. Seed-1 rng may or may not crit, so allow the crit ceiling.
		assert.ok(bank.power >= C.POWER_BANK_CAPACITY_MIN && bank.power < 2 * C.POWER_BANK_CAPACITY_MAX,
			'power within capacity range');
		assert.strictEqual(bank.hits, C.POWER_BANK_HITS);
		assert.strictEqual(bank['#nextDecayTime'], shard.time + C.POWER_BANK_DECAY);
		// The room's timer advanced into the future instead of staying due.
		const due = await inspectDuePowerBankRoomsForTest(shard);
		const entry = due.find(([ , roomName ]) => roomName === 'W0N0');
		assert.ok(entry, 'W0N0 remains scheduled');
		assert.ok(entry[0] - scheduledAt >= C.POWER_BANK_RESPAWN_TIME * 0.75, 'rescheduled into the future');
	}));

	test('non-highway rooms are never seeded', () => emptyWorld(async ({ shard }) => {
		using rng = deterministicRandomForTesting();
		await runShardInitializers(shard);
		const seeded = new Set((await inspectDuePowerBankRoomsForTest(shard)).map(([ , roomName ]) => roomName));
		assert.ok(!seeded.has('W5N5'), 'sector center is not seeded');
		assert.ok(!seeded.has('W3N3'), 'interior room is not seeded');
	}));

	test('a critical roll adds the max-capacity bonus', () => emptyWorld(async ({ shard, tick }) => {
		// base roll 0.5 -> 2750; crit roll 0.1 < POWER_BANK_CAPACITY_CRIT adds POWER_BANK_CAPACITY_MAX.
		using rng = makeRngWithPrefix([ 0.5, 0.1 ]);
		await scheduleRoom(shard, 'W0N0', 0);
		await tick(2);
		const bank = await findPowerBank(shard, 'W0N0');
		assert.ok(bank, 'a power bank was placed');
		assert.ok(bank.power >= C.POWER_BANK_CAPACITY_MAX, 'crit pushed power past the non-crit ceiling');
		assert.strictEqual(bank.power, 7750);
	}));
});
