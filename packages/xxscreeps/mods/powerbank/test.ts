import type { PartType } from 'xxscreeps/mods/creep/creep.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createPowerBank } from './powerbank.js';

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
