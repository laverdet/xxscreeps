import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createLab } from 'xxscreeps/mods/chemistry/lab.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { createLabWithResources } from 'xxscreeps/mods/chemistry/test.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
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

// =========================================================================
// TOUGH damage reduction
// =========================================================================

describe('TOUGH damage reduction', () => {
	// Defender (25,25): 2 TOUGH + 2 MOVE = 400 HP
	// Attacker (26,25): 1 ATTACK = 30 melee damage
	// Ranger  (26,24): 1 RANGED_ATTACK = 10 ranged damage
	// Healer  (26,26): 1 HEAL = 12 HP heal
	// Labs at (24,25), (24,24), (24,26) — all adjacent to defender
	const standardSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLabWithResources(
				new RoomPosition(24, 25, 'W1N1'), '100', 'GO', 300, 2000));
			room['#insertObject'](createLabWithResources(
				new RoomPosition(24, 24, 'W1N1'), '100', 'GHO2', 300, 2000));
			room['#insertObject'](createLabWithResources(
				new RoomPosition(24, 26, 'W1N1'), '100', 'XGHO2', 300, 2000));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 25, 'W1N1'),
				[C.TOUGH, C.TOUGH, C.MOVE, C.MOVE],
				'defender', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 25, 'W1N1'),
				[C.ATTACK, C.MOVE],
				'attacker', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 24, 'W1N1'),
				[C.RANGED_ATTACK, C.MOVE],
				'ranger', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 26, 'W1N1'),
				[C.HEAL, C.MOVE],
				'healer', '100'));
		},
	});

	test('unboosted TOUGH takes full damage (baseline)', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.defender.hits, 400 - 30,
				'unboosted defender should take full 30 damage');
		});
	}));

	test('GO-boosted TOUGH reduces melee damage (x0.7)', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(l => l.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// 30 * 0.7 = 21 effective HP lost
			assert.strictEqual(Game.creeps.defender.hits, 400 - 21,
				'GO-boosted TOUGH should reduce 30 damage to 21 effective');
		});
	}));

	test('GHO2-boosted TOUGH reduces melee damage (x0.5)', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(l => l.mineralType === 'GHO2')!;
			lab.boostCreep(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// 30 * 0.5 = 15 effective HP lost
			assert.strictEqual(Game.creeps.defender.hits, 400 - 15,
				'GHO2-boosted TOUGH should reduce 30 damage to 15 effective');
		});
	}));

	test('XGHO2-boosted TOUGH reduces melee damage (x0.3)', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(l => l.mineralType === 'XGHO2')!;
			lab.boostCreep(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// 30 * 0.3 = 9 effective HP lost
			assert.strictEqual(Game.creeps.defender.hits, 400 - 9,
				'XGHO2-boosted TOUGH should reduce 30 damage to 9 effective');
		});
	}));

	test('TOUGH reduction applies to ranged attack', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(l => l.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.ranger.rangedAttack(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// 10 * 0.7 = 7 effective HP lost
			assert.strictEqual(Game.creeps.defender.hits, 400 - 7,
				'GO-boosted TOUGH should reduce ranged 10 damage to 7 effective');
		});
	}));

	test('TOUGH reduction with same-tick healing', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(l => l.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
			Game.creeps.healer.heal(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// 30 damage * 0.7 = 21 effective, +12 healing = net -9
			assert.strictEqual(Game.creeps.defender.hits, 400 - 21 + 12,
				'TOUGH reduction applies to gross damage, healing added independently');
		});
	}));

	// Overflow: 1 TOUGH + 2 MOVE (300 HP) vs 8 ATTACK (240 damage)
	// With GHO2 (0.5): TOUGH absorbs 200 dmg (destroyed), 40 overflows at 1:1
	const overflowSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLabWithResources(
				new RoomPosition(24, 25, 'W1N1'), '100', 'GHO2', 300, 2000));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 25, 'W1N1'),
				[C.TOUGH, C.MOVE, C.MOVE],
				'defender', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 25, 'W1N1'),
				[...Array(8).fill(C.ATTACK), C.MOVE],
				'attacker', '100'));
		},
	});

	test('damage overflows past destroyed TOUGH to non-TOUGH parts', () => overflowSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(l => l.mineralType === 'GHO2')!;
			lab.boostCreep(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// TOUGH (100 HP, x0.5): absorbs 200 incoming, destroyed (100 HP lost)
			// Remaining 40 hits MOVE at 1:1 (40 HP lost)
			// Total effective: 140
			assert.strictEqual(Game.creeps.defender.hits, 300 - 140,
				'overflow damage past exhausted TOUGH should hit remaining parts at full rate');
		});
	}));

	// Balanced: 2 ATTACK (60 dmg) + 5 HEAL (60 heal) = tickHitsDelta 0
	// TOUGH reduction must still apply when net delta is zero
	const balancedSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLabWithResources(
				new RoomPosition(24, 25, 'W1N1'), '100', 'GO', 300, 2000));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 25, 'W1N1'),
				[C.TOUGH, C.TOUGH, C.MOVE, C.MOVE],
				'defender', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 25, 'W1N1'),
				[C.ATTACK, C.ATTACK, C.MOVE],
				'attacker', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 26, 'W1N1'),
				[...Array(5).fill(C.HEAL), C.MOVE],
				'healer', '100'));
		},
	});

	test('TOUGH reduction applies when damage exactly equals healing', () => balancedSim(async ({ player, tick }) => {
		// Boost
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(l => l.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender);
		});
		await tick();
		// Pre-damage so TOUGH gain doesn't hit hitsMax cap
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// 60 * 0.7 = 42 effective
			assert.strictEqual(Game.creeps.defender.hits, 400 - 42,
				'pre-damage should leave defender at 358');
		});
		// Attack + heal in same tick: tickHitsDelta = -60 + 60 = 0
		await player('100', Game => {
			Game.creeps.attacker.attack(Game.creeps.defender);
			Game.creeps.healer.heal(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			// TOUGH reduces 60 to 42 effective, +60 healing = net +18
			assert.strictEqual(Game.creeps.defender.hits, 358 + 18,
				'TOUGH reduction must apply even when raw damage equals healing');
		});
	}));
});
