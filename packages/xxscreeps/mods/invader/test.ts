import type { StructureInvaderCore } from './invader-core.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { StructureTower } from 'xxscreeps/mods/defense/tower.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { create as createTower } from 'xxscreeps/mods/defense/tower.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { lookForStructures } from '../structure/structure.js';
import { create as createInvaderCore } from './invader-core.js';

// W7N7 has exits in all 4 directions and all neighbors have controllers:
//   TOP -> W7N8 (y=0 edge), RIGHT -> W6N7 (x=49 edge),
//   BOTTOM -> W7N6 (y=49 edge), LEFT -> W8N7 (x=0 edge)

describe('Invader exit filtering', () => {
	const dummyPos = new RoomPosition(25, 25, 'W7N7');

	// Baseline: all neighbors uncontrolled — invaders should spawn
	const uncontrolled = simulate({
		W7N7: room => {
			// Player creep activates the room for processing; energy threshold triggers invaders
			room['#insertObject'](createCreep(dummyPos, [ C.MOVE ], 'dummy', '100'));
			room['#cumulativeEnergyHarvested'] = C.INVADERS_ENERGY_GOAL * 3;
		},
	});

	test('invaders spawn in uncontrolled room', () => uncontrolled(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.dummy?.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7!.find(C.FIND_HOSTILE_CREEPS);
			assert.ok(invaders.length > 0, 'invaders should spawn when all neighbors are uncontrolled');
		});
	}));

	// All exits lead to owned rooms — no invaders should spawn
	const allOwned = simulate({
		W7N7: room => {
			// Player creep activates the room for processing; energy threshold triggers invaders
			room['#insertObject'](createCreep(dummyPos, [ C.MOVE ], 'dummy', '100'));
			room['#cumulativeEnergyHarvested'] = C.INVADERS_ENERGY_GOAL * 3;
		},
		W7N8: room => {
			room['#user'] = room.controller!['#user'] = '100';
			room['#level'] = 3;
		},
		W6N7: room => {
			room['#user'] = room.controller!['#user'] = '101';
			room['#level'] = 4;
		},
		W7N6: room => {
			room['#user'] = room.controller!['#user'] = '100';
			room['#level'] = 2;
		},
		W8N7: room => {
			room['#user'] = room.controller!['#user'] = '101';
			room['#level'] = 5;
		},
	});

	test('no invaders when all exits lead to owned rooms', () => allOwned(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.dummy?.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7!.find(C.FIND_HOSTILE_CREEPS);
			assert.strictEqual(invaders.length, 0, 'invaders should not spawn when all exits lead to owned rooms');
		});
	}));

	// All exits lead to reserved rooms — no invaders should spawn
	const allReserved = simulate({
		W7N7: room => {
			// Player creep activates the room for processing; energy threshold triggers invaders
			room['#insertObject'](createCreep(dummyPos, [ C.MOVE ], 'dummy', '100'));
			room['#cumulativeEnergyHarvested'] = C.INVADERS_ENERGY_GOAL * 3;
		},
		W7N8: room => {
			room['#user'] = room.controller!['#user'] = '100';
			room.controller!['#reservationEndTime'] = 5000;
		},
		W6N7: room => {
			room['#user'] = room.controller!['#user'] = '101';
			room.controller!['#reservationEndTime'] = 5000;
		},
		W7N6: room => {
			room['#user'] = room.controller!['#user'] = '100';
			room.controller!['#reservationEndTime'] = 5000;
		},
		W8N7: room => {
			room['#user'] = room.controller!['#user'] = '101';
			room.controller!['#reservationEndTime'] = 5000;
		},
	});

	test('no invaders when all exits lead to reserved rooms', () => allReserved(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.dummy?.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7!.find(C.FIND_HOSTILE_CREEPS);
			assert.strictEqual(invaders.length, 0, 'invaders should not spawn when all exits lead to reserved rooms');
		});
	}));

	// 3 exits blocked (TOP, RIGHT, BOTTOM owned), 1 unblocked (LEFT/W8N7)
	// LEFT exit positions have x=0
	const partialBlock = simulate({
		W7N7: room => {
			// Player creep activates the room for processing; energy threshold triggers invaders
			room['#insertObject'](createCreep(dummyPos, [ C.MOVE ], 'dummy', '100'));
			room['#cumulativeEnergyHarvested'] = C.INVADERS_ENERGY_GOAL * 3;
		},
		W7N8: room => {
			room['#user'] = room.controller!['#user'] = '100';
			room['#level'] = 3;
		},
		W6N7: room => {
			room['#user'] = room.controller!['#user'] = '101';
			room['#level'] = 4;
		},
		W7N6: room => {
			room['#user'] = room.controller!['#user'] = '100';
			room['#level'] = 2;
		},
		// W8N7 LEFT — not configured, stays uncontrolled
	});

	// W1N1 has exits TOP -> W1N2 (has controller) and BOTTOM -> W1N0 (highway, no controller).
	// TOP is owned, so invaders should only spawn at BOTTOM (y=49) — the highway exit.
	// This exercises the #user === undefined case (rooms without controllers).
	const highwayExit = simulate({
		W1N1: room => {
			// Player creep activates the room for processing; energy threshold triggers invaders
			room['#insertObject'](createCreep(new RoomPosition(25, 25, 'W1N1'), [ C.MOVE ], 'dummy', '100'));
			room['#cumulativeEnergyHarvested'] = C.INVADERS_ENERGY_GOAL * 3;
		},
		W1N2: room => {
			room['#user'] = room.controller!['#user'] = '100';
			room['#level'] = 3;
		},
		// W1N0 is a highway room (no controller, #user === undefined) — not configured
	});

	test('invaders spawn at exits to highway rooms', () => highwayExit(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.dummy?.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W1N1!.find(C.FIND_HOSTILE_CREEPS);
			assert.ok(invaders.length > 0, 'invaders should spawn at exits to highway rooms');
			for (const invader of invaders) {
				assert.strictEqual(invader.pos.y, 49,
					`invader at (${invader.pos.x},${invader.pos.y}) should be on BOTTOM exit (y=49)`);
			}
		});
	}));

	test('invaders only at exits to uncontrolled rooms', () => partialBlock(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.dummy?.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7!.find(C.FIND_HOSTILE_CREEPS);
			assert.ok(invaders.length > 0, 'invaders should spawn at unblocked exits');
			for (const invader of invaders) {
				assert.strictEqual(invader.pos.x, 0,
					`invader at (${invader.pos.x},${invader.pos.y}) should be on LEFT exit (x=0)`);
			}
		});
	}));
});

describe('Invader core', () => {
	const corePos = new RoomPosition(25, 25, 'W1N1');

	const findCore = (Game: GameConstructor) => {
		const [ core ] = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_INVADER_CORE);
		assert.ok(core, 'invader core should be visible to player');
		return core;
	};

	const deploying = simulate({
		W1N1: room => {
			room['#insertObject'](createInvaderCore(corePos, 2, 5000));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 26, 'W1N1'),
				[ C.ATTACK, C.RANGED_ATTACK, C.WORK ],
				'attacker',
				'100',
			));
		},
	});

	test('reports EFFECT_INVULNERABILITY while deploying', () => deploying(async ({ player }) => {
		await player('100', Game => {
			const core = findCore(Game);
			assert.strictEqual(core.level, 2);
			assert.strictEqual(core.ticksToDeploy, 5000 - Game.time);
			assert.strictEqual(core.spawning, null);
			assert.deepStrictEqual(core.effects, [
				{
					effect: C.EFFECT_INVULNERABILITY,
					ticksRemaining: 5000 - Game.time,
				},
			]);
		});
	}));

	test('damage paths are all blocked while deploying', () => deploying(async ({ player, tick, peekRoom }) => {
		await player('100', Game => {
			const core = findCore(Game);
			const attacker = Game.creeps.attacker!;
			assert.strictEqual(core.hits, core.hitsMax, 'core should start at full hits');
			assert.strictEqual(attacker.attack(core), C.ERR_INVALID_TARGET);
			assert.strictEqual(attacker.rangedAttack(core), C.ERR_INVALID_TARGET);
			assert.strictEqual(attacker.dismantle(core), C.ERR_INVALID_TARGET);
			// rangedMassAttack has no per-target intent check; the processor-level invulnerability skip is the backstop.
			assert.strictEqual(attacker.rangedMassAttack(), C.OK);
		});
		await tick();
		await player('100', Game => {
			const core = findCore(Game);
			assert.strictEqual(core.hits, core.hitsMax, 'invulnerable core should take no damage');
		});
		await peekRoom('W1N1', room => {
			const attacked = room.getEventLog().some(event => event.event === C.EVENT_ATTACK);
			assert.strictEqual(attacked, false, 'skipped rangedMassAttack must not emit EVENT_ATTACK');
		});
	}));

	const deployed = simulate({
		W1N1: room => {
			room['#insertObject'](createInvaderCore(corePos, 2, 0));
			room['#insertObject'](createCreep(
				new RoomPosition(25, 26, 'W1N1'),
				[ C.ATTACK ],
				'attacker',
				'100',
			));
		},
	});

	test('reports no effects once deployed', () => deployed(async ({ player }) => {
		await player('100', Game => {
			const core = findCore(Game);
			assert.strictEqual(core.ticksToDeploy, undefined);
			assert.strictEqual(core.effects, undefined);
		});
	}));

	test('attack on deployed core deals damage', () => deployed(async ({ player, tick }) => {
		await player('100', Game => {
			const core = findCore(Game);
			assert.strictEqual(core.hits, core.hitsMax, 'core should start at full hits');
			assert.strictEqual(Game.creeps.attacker!.attack(core), C.OK);
		});
		await tick();
		await player('100', Game => {
			const core = findCore(Game);
			assert.strictEqual(core.hits, core.hitsMax - C.ATTACK_POWER);
		});
	}));

	const deployingWithCollapse = simulate({
		W1N1: room => {
			const core = createInvaderCore(corePos, 2, 5000);
			core['#collapseTime'] = 10000;
			room['#insertObject'](core);
			room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), [ C.MOVE ], 'observer', '100'));
		},
	});

	test('effects compose deploy + collapse timers', () => deployingWithCollapse(async ({ player }) => {
		await player('100', Game => {
			const core = findCore(Game);
			assert.deepStrictEqual(core.effects, [
				{ effect: C.EFFECT_INVULNERABILITY, ticksRemaining: 5000 - Game.time },
				{ effect: C.EFFECT_COLLAPSE_TIMER, ticksRemaining: 10000 - Game.time },
			]);
		});
	}));

	const findRoomCore = (room: Room) =>
		room.find(C.FIND_STRUCTURES).find(
			(structure): structure is StructureInvaderCore => structure.structureType === C.STRUCTURE_INVADER_CORE);

	// A presence creep activates the room for processing; NPC '2' alone is filtered out by
	// `updateUserRoomRelationships`, so without a human user the room never enters the process queue.
	const presencePos = new RoomPosition(10, 10, 'W1N1');
	const placePresenceCreep = (room: Room) =>
		room['#insertObject'](createCreep(presencePos, [ C.MOVE ], 'dummy', '100'));

	const coreInNeutralRoom = simulate({
		W1N1: room => {
			placePresenceCreep(room);
			room['#insertObject'](createInvaderCore(corePos, 2, 0));
		},
	});

	test('NPC reserves a neutral controller and logs the action', () => coreInNeutralRoom(async ({ tick, peekRoom }) => {
		await tick();
		await peekRoom('W1N1', (room, Game) => {
			const controller = room.controller!;
			const expectedFirst = Game.time + C.INVADER_CORE_CONTROLLER_POWER * C.CONTROLLER_RESERVE + 1;
			assert.strictEqual(controller['#reservationEndTime'], expectedFirst);
			assert.strictEqual(room['#user'], '2', 'room user becomes 2 once reserved');
			const core = findRoomCore(room)!;
			const action = [ ...core['#actionLog'] ].find(entry => entry.type === 'reserveController');
			assert.ok(action, 'expected reserveController action log entry');
			assert.strictEqual(action.time, Game.time);
			assert.strictEqual(action.x, controller.pos.x);
			assert.strictEqual(action.y, controller.pos.y);
		});
	}));

	test('extending own reservation accumulates by INVADER_CORE_CONTROLLER_POWER * CONTROLLER_RESERVE',
		() => coreInNeutralRoom(async ({ tick, peekRoom }) => {
			await tick();
			const first = await peekRoom('W1N1', room => room.controller!['#reservationEndTime']);
			await tick();
			const second = await peekRoom('W1N1', room => room.controller!['#reservationEndTime']);
			assert.strictEqual(second - first, C.INVADER_CORE_CONTROLLER_POWER * C.CONTROLLER_RESERVE);
		}));

	const hostileReservation = simulate({
		W1N1: room => {
			room['#user'] = '101';
			room.controller!['#reservationEndTime'] = 5000;
			placePresenceCreep(room);
			room['#insertObject'](createInvaderCore(corePos, 2, 0));
		},
	});

	test('NPC attacks a hostile reservation', () => hostileReservation(async ({ tick, peekRoom }) => {
		await tick();
		await peekRoom('W1N1', room => {
			const controller = room.controller!;
			const expected = 5000 - C.INVADER_CORE_CONTROLLER_POWER * C.CONTROLLER_RESERVE;
			assert.strictEqual(controller['#reservationEndTime'], expected,
				'attackController should subtract INVADER_CORE_CONTROLLER_POWER * CONTROLLER_RESERVE');
		});
	}));

	// Synthetic state: invader "owns" the controller (level > 0 with #user='2'). No code path
	// reaches this state today; the upgradeController processor exists for the stronghold
	// deployment path that will set it.
	const coreOwnsController = simulate({
		W1N1: room => {
			room['#level'] = 1;
			room['#user'] = '2';
			room.controller!['#user'] = '2';
			room.controller!['#downgradeTime'] = 1000;
			placePresenceCreep(room);
			room['#insertObject'](createInvaderCore(corePos, 2, 0));
		},
	});

	test('NPC upgrades an own controller and applies invulnerability', () => coreOwnsController(async ({ tick, peekRoom }) => {
		await tick();
		await peekRoom('W1N1', (room, Game) => {
			const controller = room.controller!;
			const expiry = Game.time + C.INVADER_CORE_CONTROLLER_DOWNGRADE;
			assert.strictEqual(controller['#downgradeTime'], expiry);
			const invulnerability = controller.effects?.find(effect => effect.effect === C.EFFECT_INVULNERABILITY);
			assert.ok(invulnerability, 'controller should report EFFECT_INVULNERABILITY after upgradeController');
			assert.strictEqual(invulnerability.ticksRemaining, C.INVADER_CORE_CONTROLLER_DOWNGRADE);
		});
	}));

	const refillScene = simulate({
		W1N1: room => {
			room['#insertObject'](createInvaderCore(corePos, 2, 0));
			room['#insertObject'](createTower(new RoomPosition(26, 25, 'W1N1'), '2'));
		},
	});

	test('transferEnergy accepts in-room tower target', () => refillScene(async ({ poke }) => {
		const results = await poke('W1N1', '2', (Game, room) => {
			const core = findRoomCore(room)!;
			const tower = room.find(C.FIND_STRUCTURES).find(
				(structure): structure is StructureTower => structure.structureType === C.STRUCTURE_TOWER,
			)!;
			// Oversized amounts pass the check and clamp at the processor
			return [ core.transferEnergy(tower, 100), core.transferEnergy(tower, C.TOWER_CAPACITY + 100) ];
		});
		assert.deepStrictEqual(results, [ C.OK, C.OK ]);
	}));

	const collapsing = simulate({
		W1N1: room => {
			room['#user'] = '2';
			room.controller!['#reservationEndTime'] = 5000;
			const core = createInvaderCore(corePos, 2, 0);
			core['#collapseTime'] = 1; // expires by Game.time === 1 on the first processed tick
			placePresenceCreep(room);
			room['#insertObject'](core);
		},
	});

	test('collapse expiry removes the core and leaves the reservation ticking', () => collapsing(async ({ tick, peekRoom }) => {
		await tick();
		await peekRoom('W1N1', (room, Game) => {
			assert.strictEqual(findRoomCore(room), undefined, 'core should be removed after collapse');
			assert.ok(room.controller!['#reservationEndTime'] > Game.time, 'reservation is left to expire on its own');
			assert.strictEqual(room['#user'], '2', 'room stays reserved by the NPC');
		});
	}));

	test('collapse expiry leaves no ruin and emits no destroyed event', () => collapsing(async ({ tick, peekRoom }) => {
		await tick();
		await peekRoom('W1N1', room => {
			const ruins = room.find(C.FIND_RUINS);
			assert.strictEqual(ruins.length, 0, 'collapse expiry must not leave a Ruin');
			const destroyed = room.getEventLog().find(event => event.event === C.EVENT_OBJECT_DESTROYED);
			assert.strictEqual(destroyed, undefined, 'collapse must not emit EVENT_OBJECT_DESTROYED');
		});
	}));

	const reservedThenKilled = simulate({
		W1N1: room => {
			room['#user'] = '2';
			room.controller!['#reservationEndTime'] = 5000;
			const core = createInvaderCore(corePos, 2, 0);
			core.hits = 1; // single attack drops it; the kill path is what we're exercising
			room['#insertObject'](core);
			room['#insertObject'](createCreep(
				new RoomPosition(25, 26, 'W1N1'),
				[ C.ATTACK ],
				'killer',
				'100',
			));
		},
	});

	test('damage-destroy leaves a Ruin and the reservation ticking',
		() => reservedThenKilled(async ({ player, tick, peekRoom }) => {
			await player('100', Game => {
				const core = findCore(Game);
				assert.strictEqual(Game.creeps.killer!.attack(core), C.OK);
			});
			await tick();
			await peekRoom('W1N1', (room, Game) => {
				assert.strictEqual(findRoomCore(room), undefined, 'core should be removed');
				assert.ok(room.controller!['#reservationEndTime'] > Game.time, 'reservation is left to expire on its own');
				assert.strictEqual(room['#user'], '2', 'room stays reserved by the NPC');
				assert.strictEqual(room.find(C.FIND_RUINS).length, 1, 'damage-destroy leaves a Ruin');
				const destroyed = room.getEventLog().find(event => event.event === C.EVENT_OBJECT_DESTROYED);
				assert.ok(destroyed, 'damage-destroy emits EVENT_OBJECT_DESTROYED');
			});
		}));
});
