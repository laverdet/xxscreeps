import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createLab } from 'xxscreeps/mods/chemistry/lab.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Combat', () => {
	// 17 ATTACK (510 dmg), 1 RANGED_ATTACK (10 dmg)
	// attack intent (type 'primary') runs before rangedAttack (type 'laser').
	// 510 melee damage kills the 500 HP lab, then the ranged intent fires on
	// the already-dead structure. #destroy was not previously idempotent and
	// so created two ruins
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 24, 'W1N1'),
				[
					...Fn.map(Fn.range(17), () => C.ATTACK),
					...Fn.map(Fn.range(1), () => C.RANGED_ATTACK),
				],
				'warrior',
				'100',
			));
		},
	});

	test('attack + rangedAttack killing a structure produces exactly one ruin', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = Game.rooms.W1N1.find(C.FIND_STRUCTURES)
				.find(structure => structure.structureType === C.STRUCTURE_LAB)!;
			assert.strictEqual(Game.creeps.warrior.attack(lab), C.OK);
			assert.strictEqual(Game.creeps.warrior.rangedAttack(lab), C.OK);
		});
		await tick();
		await player('100', Game => {
			const ruins = Game.rooms.W1N1.find(C.FIND_RUINS);
			const labRuins = ruins.filter(ruin => ruin.pos.x === 25 && ruin.pos.y === 25);
			assert.strictEqual(labRuins.length, 1,
				`expected 1 ruin at lab position, got ${labRuins.length}`);
		});
	}));
});

describe('getEventLog', () => {
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 24, 'W1N1'),
				[ C.ATTACK ],
				'attacker',
				'100',
			));
		},
	});

	test('returns an array', () => sim(async ({ player }) => {
		await player('100', Game => {
			const log = Game.rooms.W1N1.getEventLog();
			assert.ok(Array.isArray(log));
		});
	}));

	test('records attack events after processing', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = Game.rooms.W1N1.find(C.FIND_STRUCTURES)
				.find(structure => structure.structureType === C.STRUCTURE_LAB)!;
			assert.strictEqual(Game.creeps.attacker.attack(lab), C.OK);
		});
		await tick();
		await player('100', Game => {
			const log = Game.rooms.W1N1.getEventLog();
			const attackEvent: unknown = log.find(event => event.event === C.EVENT_ATTACK);
			assert.ok(attackEvent, 'expected an attack event in the event log');
		});
	}));

	test('raw mode returns JSON string', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = Game.rooms.W1N1.find(C.FIND_STRUCTURES)
				.find(structure => structure.structureType === C.STRUCTURE_LAB)!;
			Game.creeps.attacker.attack(lab);
		});
		await tick();
		await player('100', Game => {
			const raw = Game.rooms.W1N1.getEventLog(true);
			assert(typeof raw === 'string');
			const parsed: unknown = JSON.parse(raw);
			assert.ok(Array.isArray(parsed));
		});
	}));
});
