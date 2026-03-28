import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { create as createLab } from 'xxscreeps/mods/chemistry/lab.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

describe('Combat', () => {
	// 17 ATTACK (510 dmg), 1 RANGED_ATTACK (10 dmg), 18 MOVE.
	// attack intent (type 'primary') runs before rangedAttack (type 'laser').
	// 510 melee damage kills the 500 HP lab, then the ranged intent fires on
	// the already-dead structure. Without the #applyDamage guard this calls
	// #destroy a second time, producing a duplicate ruin.
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 24, 'W1N1'),
				[
					...Array(17).fill(C.ATTACK),
					...Array(1).fill(C.RANGED_ATTACK),
					...Array(18).fill(C.MOVE),
				],
				'warrior',
				'100',
			));
		},
	});

	test('attack + rangedAttack killing a structure produces exactly one ruin', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = Game.rooms.W1N1.find(C.FIND_STRUCTURES)
				.find((s: any) => s.structureType === C.STRUCTURE_LAB)!;
			assert.strictEqual(Game.creeps.warrior.attack(lab), C.OK);
			assert.strictEqual(Game.creeps.warrior.rangedAttack(lab), C.OK);
		});
		await tick();
		await player('100', Game => {
			const ruins = Game.rooms.W1N1.find(C.FIND_RUINS);
			const labRuins = ruins.filter((r: any) => r.pos.x === 25 && r.pos.y === 25);
			assert.strictEqual(labRuins.length, 1,
				`expected 1 ruin at lab position, got ${labRuins.length}`);
		});
	}));
});
