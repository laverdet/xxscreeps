import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createLab } from 'xxscreeps/mods/classic/chemistry/lab.js';
import { createLabWithResources } from 'xxscreeps/mods/classic/chemistry/test.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { create as createTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { create as createContainer } from 'xxscreeps/mods/classic/resource/container.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { getAllRowsForTesting } from 'xxscreeps/mods/meta/notifications/model.js';
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
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			assert.strictEqual(Game.creeps.warrior?.attack(lab), C.OK);
			assert.strictEqual(Game.creeps.warrior.rangedAttack(lab), C.OK);
		});
		await tick();
		await player('100', Game => {
			const ruins = Game.rooms.W1N1!.find(C.FIND_RUINS);
			const labRuins = ruins.filter(ruin => ruin.pos.x === 25 && ruin.pos.y === 25);
			assert.strictEqual(labRuins.length, 1,
				`expected 1 ruin at lab position, got ${labRuins.length}`);
		});
	}));

	const overkillHealSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			const target = createCreep(
				new RoomPosition(25, 25, 'W1N1'),
				[ C.MOVE, C.HEAL ],
				'target',
				'100',
			);
			target.hits = 12;
			target.body[0]!.hits = 0;
			target.body[1]!.hits = 12;
			room['#insertObject'](target);
			room['#insertObject'](createCreep(
				new RoomPosition(26, 25, 'W1N1'),
				[ C.ATTACK, C.MOVE ],
				'attacker',
				'101',
			));
		},
	});

	test('lethal overkill kills creep after same-tick healing', () => overkillHealSim(async ({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.target?.heal(Game.creeps.target), C.OK);
		});
		await player('101', Game => {
			const target = Game.rooms.W1N1!.find(C.FIND_HOSTILE_CREEPS)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(target), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.target, undefined);
			assert.strictEqual(Game.rooms.W1N1?.find(C.FIND_TOMBSTONES).length, 1);
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
			const log = Game.rooms.W1N1!.getEventLog();
			assert.ok(Array.isArray(log));
		});
	}));

	test('records attack events after processing', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(lab), C.OK);
		});
		await tick();
		await player('100', Game => {
			const log = Game.rooms.W1N1!.getEventLog();
			const attackEvent = log.find(event => event.event === C.EVENT_ATTACK);
			assert.ok(attackEvent, 'expected an attack event in the event log');
			assert.strictEqual(attackEvent.objectId, Game.creeps.attacker?.id);
			assert.ok(attackEvent.data, 'expected nested data payload');
			assert.strictEqual(attackEvent.data.attackType, C.EVENT_ATTACK_TYPE_MELEE);
			assert.ok(typeof attackEvent.data.damage === 'number');
		});
	}));

	test('raw mode returns vanilla-shaped JSON string', () => sim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			Game.creeps.attacker?.attack(lab);
		});
		await tick();
		await player('100', Game => {
			const raw = Game.rooms.W1N1!.getEventLog(true);
			assert.ok(typeof raw === 'string');
			const parsed = JSON.parse(raw) as { event: number; objectId: string; data?: Record<string, unknown> }[];
			assert.ok(Array.isArray(parsed));
			const attack = parsed.find(event => event.event === C.EVENT_ATTACK);
			assert.ok(attack, 'attack event missing from raw log');
			assert.ok(attack.data && typeof attack.data === 'object', 'attack event data must be an object');
		});
	}));
});

describe('getEventLog missing events', () => {
	// Structure destruction (EVENT_OBJECT_DESTROYED) from damage.
	const structureKill = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 24, 'W1N1'),
				[ ...Fn.map(Fn.range(17), () => C.ATTACK) ],
				'warrior', '100',
			));
		},
	});

	test('structure death emits EVENT_OBJECT_DESTROYED with structureType', () => structureKill(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			Game.creeps.warrior?.attack(lab);
		});
		await tick();
		await player('100', Game => {
			const log = Game.rooms.W1N1!.getEventLog();
			const destroyed = log.find(event => event.event === C.EVENT_OBJECT_DESTROYED);
			assert.ok(destroyed, 'expected an EVENT_OBJECT_DESTROYED entry');
			assert.ok(destroyed.data, 'expected nested data payload');
			assert.strictEqual(destroyed.data.type, C.STRUCTURE_LAB);
		});
	}));

	// Two attackers landing on the same structure on the same tick must produce
	// exactly one EVENT_OBJECT_DESTROYED — the destroyed-event must gate on the
	// alive→dead transition, not on the post-damage hits value.
	const multiAttackerKill = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			const lab = createLab(new RoomPosition(25, 25, 'W1N1'), '100');
			room['#insertObject'](lab);
			room['#insertObject'](createCreep(
				new RoomPosition(25, 24, 'W1N1'),
				[ ...Fn.map(Fn.range(17), () => C.ATTACK) ],
				'warriorA', '100',
			));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 26, 'W1N1'),
				[ ...Fn.map(Fn.range(17), () => C.ATTACK) ],
				'warriorB', '100',
			));
		},
	});

	test('multi-attacker kill emits EVENT_OBJECT_DESTROYED exactly once', () => multiAttackerKill(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			Game.creeps.warriorA?.attack(lab);
			Game.creeps.warriorB?.attack(lab);
		});
		await tick();
		await player('100', Game => {
			const log = Game.rooms.W1N1!.getEventLog();
			const destroyed = log.filter(event => event.event === C.EVENT_OBJECT_DESTROYED);
			assert.strictEqual(destroyed.length, 1,
				`expected exactly one EVENT_OBJECT_DESTROYED for one structure death, got ${destroyed.length}`);
		});
	}));
});

describe('Structure.notifyWhenAttacked attack notifications', () => {
	const user = '100';
	const attackerUser = '101';
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = user;
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), user));
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.ATTACK ], 'attacker', attackerUser));
		},
	});
	const selfAttack = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = user;
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), user));
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.ATTACK ], 'attacker', user));
		},
	});
	const sameTickAttack = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = user;
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), user));
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.ATTACK ], 'attackerA', attackerUser));
			room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), [ C.ATTACK ], 'attackerB', attackerUser));
		},
	});

	test('attacking a structure queues an owner notification by default', () => sim(async ({ player, shard, tick }) => {
		// Advance past the time-0 drain cadence before queuing a notification.
		await tick(1);
		let labId = '';
		await player(attackerUser, Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			labId = lab.id;
			assert.strictEqual(Game.creeps.attacker?.attack(lab), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0]?.message, `Your lab #${labId} in room W1N1 is under attack!`);
		assert.strictEqual(rows[0].type, 'msg');
	}));

	test('own attacks do not queue owner notifications', () => selfAttack(async ({ player, shard, tick }) => {
		await player(user, Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(lab), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 0);
	}));

	test('attacks accumulate count on a single row across attackers and ticks', () => sameTickAttack(async ({ player, shard, tick }) => {
		await tick(1);
		let labId = '';
		await player(attackerUser, Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			labId = lab.id;
			assert.strictEqual(Game.creeps.attackerA?.attack(lab), C.OK);
			assert.strictEqual(Game.creeps.attackerB?.attack(lab), C.OK);
		});
		await tick();
		await player(attackerUser, Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			assert.strictEqual(Game.creeps.attackerA?.attack(lab), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 1, 'attacks share a single notification row');
		assert.strictEqual(rows[0]?.message, `Your lab #${labId} in room W1N1 is under attack!`);
		assert.strictEqual(rows[0].count, 3, '2 attackers in tick 1 + 1 attacker in tick 2');
	}));

	test('notifyWhenAttacked(false) suppresses owner notifications', () => sim(async ({ player, shard, tick }) => {
		await player(user, Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			assert.strictEqual(lab.notifyWhenAttacked(false), C.OK);
		});
		await tick();
		await player(attackerUser, Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(lab), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 0);
	}));

	const dismantleSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = user;
			room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), user));
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.WORK, C.MOVE ], 'wrecker', attackerUser));
		},
	});

	test('dismantle path queues structure owner notification', () => dismantleSim(async ({ player, shard, tick }) => {
		await tick(1);
		let labId = '';
		await player(attackerUser, Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			labId = lab.id;
			assert.strictEqual(Game.creeps.wrecker?.dismantle(lab), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0]?.message, `Your lab #${labId} in room W1N1 is under attack!`);
	}));
});

describe('Creep.notifyWhenAttacked attack notifications', () => {
	const user = '100';
	const attackerUser = '101';
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = user;
			room['#insertObject'](createCreep(new RoomPosition(25, 25, 'W1N1'), [ C.MOVE, C.MOVE ], 'target', user));
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.ATTACK ], 'attacker', attackerUser));
		},
	});
	const selfAttack = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = user;
			room['#insertObject'](createCreep(new RoomPosition(25, 25, 'W1N1'), [ C.MOVE, C.MOVE ], 'target', user));
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.ATTACK ], 'attacker', user));
		},
	});

	test('attacking a creep queues an owner notification by default', () => sim(async ({ player, shard, tick }) => {
		await tick(1);
		await player(attackerUser, Game => {
			const target = Game.rooms.W1N1!.lookForAt(C.LOOK_CREEPS, 25, 25)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(target), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0]?.message, 'Your creep target in room W1N1 is under attack!');
		assert.strictEqual(rows[0].type, 'msg');
	}));

	test('own attacks do not queue owner notifications', () => selfAttack(async ({ player, shard, tick }) => {
		await player(user, Game => {
			const target = Game.rooms.W1N1!.lookForAt(C.LOOK_CREEPS, 25, 25)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(target), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 0);
	}));

	test('notifyWhenAttacked(false) suppresses owner notifications', () => sim(async ({ player, shard, tick }) => {
		await player(user, Game => {
			assert.strictEqual(Game.creeps.target?.notifyWhenAttacked(false), C.OK);
		});
		await tick();
		await player(attackerUser, Game => {
			const target = Game.rooms.W1N1!.lookForAt(C.LOOK_CREEPS, 25, 25)[0]!;
			assert.strictEqual(Game.creeps.attacker?.attack(target), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, user);
		assert.strictEqual(rows.length, 0);
	}));

	const towerSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = user;
			const tower = createTower(new RoomPosition(25, 25, 'W1N1'), user);
			tower.store['#add'](C.RESOURCE_ENERGY, C.TOWER_ENERGY_COST);
			room['#insertObject'](tower);
			room['#insertObject'](createCreep(new RoomPosition(25, 24, 'W1N1'), [ C.MOVE ], 'victim', attackerUser));
		},
	});

	test('tower attack path queues target creep owner notification', () => towerSim(async ({ player, shard, tick }) => {
		await tick(1);
		await player(user, Game => {
			const tower = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_TOWER)[0]!;
			const victim = Game.rooms.W1N1!.lookForAt(C.LOOK_CREEPS, 25, 24)[0]!;
			assert.strictEqual(tower.attack(victim), C.OK);
		});
		await tick();
		const rows = await getAllRowsForTesting(shard, attackerUser);
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0]?.message, 'Your creep victim in room W1N1 is under attack!');
	}));
});

// =========================================================================
// TOUGH damage reduction
// =========================================================================

describe('TOUGH damage reduction', () => {
	// No exported constant for HP per body part — keep local
	const HITS_PER_PART = 100;

	// Defender (25,25): 2 TOUGH + 2 MOVE
	// Attacker (26,25): 1 ATTACK
	// Ranger  (26,24): 1 RANGED_ATTACK
	// Healer  (26,26): 1 HEAL
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
				[ C.TOUGH, C.TOUGH, C.MOVE, C.MOVE ],
				'defender', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 25, 'W1N1'),
				[ C.ATTACK, C.MOVE ],
				'attacker', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 24, 'W1N1'),
				[ C.RANGED_ATTACK, C.MOVE ],
				'ranger', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 26, 'W1N1'),
				[ C.HEAL, C.MOVE ],
				'healer', '100'));
		},
	});

	test('unboosted TOUGH takes full damage (baseline)', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.attacker?.attack(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.defender?.hits,
				4 * HITS_PER_PART - C.ATTACK_POWER,
				'unboosted defender should take full ATTACK_POWER damage');
		});
	}));

	test('GO-boosted TOUGH reduces melee damage', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(lab => lab.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker?.attack(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			const effectiveDmg = C.ATTACK_POWER * C.BOOSTS.tough.GO.damage;
			assert.strictEqual(Game.creeps.defender?.hits,
				4 * HITS_PER_PART - effectiveDmg,
				'GO-boosted TOUGH should reduce damage by GO multiplier');
		});
	}));

	test('GHO2-boosted TOUGH reduces melee damage', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(lab => lab.mineralType === 'GHO2')!;
			lab.boostCreep(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker?.attack(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			const effectiveDmg = C.ATTACK_POWER * C.BOOSTS.tough.GHO2.damage;
			assert.strictEqual(Game.creeps.defender?.hits,
				4 * HITS_PER_PART - effectiveDmg,
				'GHO2-boosted TOUGH should reduce damage by GHO2 multiplier');
		});
	}));

	test('XGHO2-boosted TOUGH reduces melee damage', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(lab => lab.mineralType === 'XGHO2')!;
			lab.boostCreep(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker?.attack(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			const effectiveDmg = C.ATTACK_POWER * C.BOOSTS.tough.XGHO2.damage;
			assert.strictEqual(Game.creeps.defender?.hits,
				4 * HITS_PER_PART - effectiveDmg,
				'XGHO2-boosted TOUGH should reduce damage by XGHO2 multiplier');
		});
	}));

	test('TOUGH reduction applies to ranged attack', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(lab => lab.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.ranger?.rangedAttack(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			const effectiveDmg = C.RANGED_ATTACK_POWER * C.BOOSTS.tough.GO.damage;
			assert.strictEqual(Game.creeps.defender?.hits,
				4 * HITS_PER_PART - effectiveDmg,
				'GO-boosted TOUGH should reduce ranged damage by GO multiplier');
		});
	}));

	test('TOUGH reduction with same-tick healing', () => standardSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(lab => lab.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker?.attack(Game.creeps.defender!);
			Game.creeps.healer?.heal(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			const effectiveDmg = C.ATTACK_POWER * C.BOOSTS.tough.GO.damage;
			assert.strictEqual(Game.creeps.defender?.hits,
				4 * HITS_PER_PART - effectiveDmg + C.HEAL_POWER,
				'TOUGH reduction applies to gross damage, healing added independently');
		});
	}));

	// Overflow: 1 TOUGH + 2 MOVE vs overflowAttackParts × ATTACK
	// With GHO2 boost, TOUGH absorbs (HITS_PER_PART / boostFactor) incoming, rest overflows at 1:1
	const overflowAttackParts = 8;
	const overflowSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLabWithResources(
				new RoomPosition(24, 25, 'W1N1'), '100', 'GHO2', 300, 2000));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 25, 'W1N1'),
				[ C.TOUGH, C.MOVE, C.MOVE ],
				'defender', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 25, 'W1N1'),
				[ ...Array<typeof C.ATTACK>(overflowAttackParts).fill(C.ATTACK), C.MOVE ],
				'attacker', '100'));
		},
	});

	test('damage overflows past destroyed TOUGH to non-TOUGH parts', () => overflowSim(async ({ player, tick }) => {
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(lab => lab.mineralType === 'GHO2')!;
			lab.boostCreep(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			Game.creeps.attacker?.attack(Game.creeps.defender!);
		});
		await tick();
		await player('100', Game => {
			const boostFactor = C.BOOSTS.tough.GHO2.damage;
			const totalIncoming = overflowAttackParts * C.ATTACK_POWER;
			// TOUGH (1 part) absorbs (HITS_PER_PART / boostFactor) incoming before destroyed
			const toughAbsorbs = HITS_PER_PART / boostFactor;
			const overflow = totalIncoming - toughAbsorbs;
			const effectiveLoss = HITS_PER_PART + overflow;
			assert.strictEqual(Game.creeps.defender?.hits,
				3 * HITS_PER_PART - effectiveLoss,
				'overflow damage past exhausted TOUGH should hit remaining parts at full rate');
		});
	}));

	// Balanced: attackParts × ATTACK_POWER = healParts × HEAL_POWER → tickHitsDelta 0
	// TOUGH reduction must still apply when net delta is zero
	const balancedAttackParts = 2;
	const balancedHealParts = 5;
	const balancedSim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createLabWithResources(
				new RoomPosition(24, 25, 'W1N1'), '100', 'GO', 300, 2000));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 25, 'W1N1'),
				[ C.TOUGH, C.TOUGH, C.MOVE, C.MOVE ],
				'defender', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 25, 'W1N1'),
				[ ...Array<typeof C.ATTACK>(balancedAttackParts).fill(C.ATTACK), C.MOVE ],
				'attacker', '100'));
			room['#insertObject'](createCreep(
				new RoomPosition(26, 26, 'W1N1'),
				[ ...Array<typeof C.HEAL>(balancedHealParts).fill(C.HEAL), C.MOVE ],
				'healer', '100'));
		},
	});

	test('TOUGH reduction applies when damage exactly equals healing', () => balancedSim(async ({ player, tick }) => {
		const rawDmg = balancedAttackParts * C.ATTACK_POWER;
		const effectiveDmg = rawDmg * C.BOOSTS.tough.GO.damage;
		const healAmount = balancedHealParts * C.HEAL_POWER;
		const defenderHits = 4 * HITS_PER_PART;

		// Boost
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)
				.find(lab => lab.mineralType === 'GO')!;
			lab.boostCreep(Game.creeps.defender!);
		});
		await tick();
		// Pre-damage so TOUGH gain doesn't hit hitsMax cap
		await player('100', Game => {
			Game.creeps.attacker?.attack(Game.creeps.defender!);
		});
		await tick();
		const afterPreDmg = defenderHits - effectiveDmg;
		// Assert pre-damage, then attack + heal in same tick
		await player('100', Game => {
			assert.strictEqual(Game.creeps.defender?.hits, afterPreDmg,
				'pre-damage should reduce hits by boosted attack damage');
			Game.creeps.attacker?.attack(Game.creeps.defender);
			Game.creeps.healer?.heal(Game.creeps.defender);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.defender?.hits,
				afterPreDmg - effectiveDmg + healAmount,
				'TOUGH reduction must apply even when raw damage equals healing');
		});
	}));
});

// =========================================================================
// rangedMassAttack range and target filter
// =========================================================================

describe('rangedMassAttack', () => {
	// Attacker at (25,25) is player '101' with one RANGED_ATTACK part (base
	// power 10). Targets surround at ranges 1/2/3 and varied ownership; the
	// range rates 1/0.4/0.1 yield 10/4/1 damage.
	const sim = simulate({
		W1N1: room => {
			room['#level'] = 7;
			room['#user'] = room.controller!['#user'] = '100';
			room['#insertObject'](createCreep(new RoomPosition(25, 25, 'W1N1'), [ C.RANGED_ATTACK ], 'attacker', '101'));
			room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W1N1'), [ C.MOVE ], 'enemyR1', '100'));
			room['#insertObject'](createCreep(new RoomPosition(27, 25, 'W1N1'), [ C.MOVE ], 'enemyR2', '100'));
			room['#insertObject'](createCreep(new RoomPosition(28, 25, 'W1N1'), [ C.MOVE ], 'enemyR3', '100'));
			room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), [ C.MOVE ], 'ally', '101'));
			room['#insertObject'](createContainer(new RoomPosition(24, 25, 'W1N1')));
			room['#insertObject'](createLab(new RoomPosition(25, 24, 'W1N1'), '100'));
		},
	});

	const HITS_PER_PART = 100;

	test('hostile creep at range 1 takes 10 damage', () => sim(async ({ player, tick }) => {
		await player('101', Game => {
			assert.strictEqual(Game.creeps.attacker?.rangedMassAttack(), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.enemyR1?.hits, HITS_PER_PART - 10,
				'range-1 hostile creep should take 10 damage');
		});
	}));

	test('hostile creep at range 2 takes 4 damage', () => sim(async ({ player, tick }) => {
		await player('101', Game => {
			Game.creeps.attacker?.rangedMassAttack();
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.enemyR2?.hits, HITS_PER_PART - 4,
				'range-2 hostile creep should take 4 damage');
		});
	}));

	test('hostile creep at range 3 takes 1 damage', () => sim(async ({ player, tick }) => {
		await player('101', Game => {
			Game.creeps.attacker?.rangedMassAttack();
		});
		await tick();
		await player('100', Game => {
			assert.strictEqual(Game.creeps.enemyR3?.hits, HITS_PER_PART - 1,
				'range-3 hostile creep should take 1 damage');
		});
	}));

	test('own creep is not damaged', () => sim(async ({ player, tick }) => {
		await player('101', Game => {
			Game.creeps.attacker?.rangedMassAttack();
		});
		await tick();
		await player('101', Game => {
			assert.strictEqual(Game.creeps.ally?.hits, HITS_PER_PART,
				'own creep must not be damaged by rangedMassAttack');
		});
	}));

	test('unowned structure is not damaged', () => sim(async ({ player, tick }) => {
		await player('101', Game => {
			Game.creeps.attacker?.rangedMassAttack();
		});
		await tick();
		await player('100', Game => {
			const container = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_CONTAINER)[0]!;
			assert.strictEqual(container.hits, C.CONTAINER_HITS,
				'unowned container must not be damaged');
		});
	}));

	test('hostile owned structure is damaged', () => sim(async ({ player, tick }) => {
		await player('101', Game => {
			Game.creeps.attacker?.rangedMassAttack();
		});
		await tick();
		await player('100', Game => {
			const lab = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB)[0]!;
			assert.strictEqual(lab.hits, lab.hitsMax - 10,
				'range-1 hostile lab should take 10 damage');
		});
	}));
});
