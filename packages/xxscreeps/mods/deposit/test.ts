import type { PartType } from 'xxscreeps/mods/creep/creep.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { DEPOSIT_DECAY_TIME, DEPOSIT_EXHAUST_MULTIPLY, DEPOSIT_EXHAUST_POW } from 'xxscreeps/mods/mineral/constants.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { Deposit } from './deposit.js';

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
	deposit['#lastCooldown'] = 0;
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
			const deposit = Game.rooms.W1N1.find(C.FIND_DEPOSITS)[0];
			assert.strictEqual(Game.creeps.harvester.harvest(deposit), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.harvester.store[C.RESOURCE_SILICON], 3);
		});
		await poke('W1N1', '100', (_Game, room) => {
			const deposit = room['#lookFor'](C.LOOK_DEPOSITS)[0];
			assert.strictEqual(deposit.lastCooldown, cooldown(1000));
			assert.strictEqual(deposit.cooldown, cooldown(1000));
		});
	}));

	test('harvest returns ERR_TIRED while cooling', () => depositSim({
		cooldownTicks: 1000,
	})(async ({ player, tick }) => {
		await player('100', Game => {
			const deposit = Game.rooms.W1N1.find(C.FIND_DEPOSITS)[0];
			assert.strictEqual(Game.creeps.harvester.harvest(deposit), C.ERR_TIRED);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.harvester.store[C.RESOURCE_SILICON], 0);
		});
	}));

	test('deposit is deleted when decay time expires', () => depositSim({
		decayTicks: 2,
	})(async ({ player, tick }) => {
		await tick(2);
		await player('100', Game => {
			assert.strictEqual(Game.rooms.W1N1.find(C.FIND_DEPOSITS).length, 0);
		});
	}));

	test('harvest refreshes decay time', () => depositSim({
		decayTicks: 5,
	})(async ({ player, tick }) => {
		await player('100', Game => {
			const deposit = Game.rooms.W1N1.find(C.FIND_DEPOSITS)[0];
			assert.strictEqual(Game.creeps.harvester.harvest(deposit), C.OK);
		});
		await tick();
		await player('100', Game => {
			const deposit = Game.rooms.W1N1.find(C.FIND_DEPOSITS)[0];
			assert.strictEqual(deposit.ticksToDecay, DEPOSIT_DECAY_TIME);
		});
	}));
});
