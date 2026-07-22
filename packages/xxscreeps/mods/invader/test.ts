import type { StructureInvaderCore } from './invader-core.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { GameConstructor } from 'xxscreeps/game/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition, iterateNeighbors } from 'xxscreeps/game/position.js';
import { create as createSite } from 'xxscreeps/mods/classic/construction/construction-site.js';
import { create as createCreep } from 'xxscreeps/mods/classic/creep/creep.js';
import { create as createRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import { create as createTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { create as createContainer } from 'xxscreeps/mods/classic/resource/container.js';
import { create as createRoad } from 'xxscreeps/mods/classic/road/road.js';
import { activateNPC } from 'xxscreeps/mods/npc/processor.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { lookForStructureAt, lookForStructures } from '../classic/structure/structure.js';
import { create as createInvaderCore } from './invader-core.js';

// W7N7 has exits in all 4 directions and all neighbors have controllers:
//   TOP -> W7N8 (y=0 edge), RIGHT -> W6N7 (x=49 edge),
//   BOTTOM -> W7N6 (y=49 edge), LEFT -> W8N7 (x=0 edge)

describe('mod/invader', () => {
	describe('exit filtering', () => {
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

	describe('core', () => {
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

		// Deploy completes at Game.time === 2; an observer outside the bunker1 footprint keeps the room
		// visible across the boundary without being crushed by the deploy.
		const deployBoundary = simulate({
			W1N1: room => {
				const core = createInvaderCore(corePos, 2, 2);
				core['#templateName'] = 'bunker1';
				room['#insertObject'](core);
				room['#insertObject'](createCreep(new RoomPosition(23, 25, 'W1N1'), [ C.MOVE ], 'observer', '100'));
			},
		});

		test('clears the deploy timer the tick after it elapses', () => deployBoundary(async ({ player, tick }) => {
			// Game.time === deployTime: final invulnerable tick, `ticksToDeploy === 0`.
			await tick(2);
			await player('100', Game => {
				const core = findCore(Game);
				assert.strictEqual(Game.time, 2);
				assert.strictEqual(core.ticksToDeploy, 0, 'invulnerable through Game.time === deployTime');
				assert.deepStrictEqual(core.effects, [ { effect: C.EFFECT_INVULNERABILITY, ticksRemaining: 0 } ]);
			});
			// Game.time === deployTime + 1: the elapsed timer deploys the stronghold, swapping
			// invulnerability for a collapse timer. Reading the expiry getters must not throw.
			await tick();
			await player('100', Game => {
				const core = findCore(Game);
				assert.strictEqual(Game.time, 3);
				assert.strictEqual(core.ticksToDeploy, undefined, 'deploy timer cleared after it elapses');
				const effects = core.effects!;
				assert.strictEqual(effects.length, 1, 'a deployed core reports only the collapse timer');
				assert.strictEqual(effects[0]!.effect, C.EFFECT_COLLAPSE_TIMER);
				assert.ok(effects[0]!.ticksRemaining > 0, 'collapse timer is counting down');
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

		const findRoomCore = (room: Room) => lookForStructures(room, C.STRUCTURE_INVADER_CORE)[0];

		// `activateNPC` registers invader NPC '2' as this room's loop driver; the `simulate` harness
		// seeds rooms with an active NPC into the processor queue (mirroring the main-service boot), so
		// these `peekRoom` cases process without a stand-in human presence creep.
		const coreInNeutralRoom = simulate({
			W1N1: room => {
				room['#insertObject'](createInvaderCore(corePos, 2, 0));
				activateNPC(room, '2');
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
				const action = core['#actionLog'].find(entry => entry.type === 'reserveController');
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
				room['#insertObject'](createInvaderCore(corePos, 2, 0));
				activateNPC(room, '2');
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
				room['#insertObject'](createInvaderCore(corePos, 2, 0));
				activateNPC(room, '2');
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
				const tower = lookForStructures(room, C.STRUCTURE_TOWER)[0]!;
				// Oversized amounts pass the check and clamp at the processor
				return [ core['#transferEnergy'](tower, 100), core['#transferEnergy'](tower, C.TOWER_CAPACITY + 100) ];
			});
			assert.deepStrictEqual(results, [ C.OK, C.OK ]);
		}));

		const collapsing = simulate({
			W1N1: room => {
				room['#user'] = '2';
				room.controller!['#reservationEndTime'] = 5000;
				const core = createInvaderCore(corePos, 2, 0);
				core['#collapseTime'] = 1; // expires by Game.time === 1 on the first processed tick
				room['#insertObject'](core);
				activateNPC(room, '2');
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
				room['#insertObject'](createCreep(new RoomPosition(25, 26, 'W1N1'), [ C.ATTACK ], 'killer', '100'));
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

	describe('core spawning', () => {
		const corePos = new RoomPosition(25, 25, 'W1N1');
		const findRoomCore = (room: Room) => lookForStructures(room, C.STRUCTURE_INVADER_CORE)[0]!;
		const findCreep = (room: Room, name: string) => room.find(C.FIND_CREEPS).find(creep => creep.name === name);
		// Level 5 spawns one tick per body part (`INVADER_CORE_CREEP_SPAWN_TIME[5] === 1`), so a 2-part
		// body needs 2 ticks — the shortest countdown the mechanism still exercises.
		const body = [ C.MOVE, C.ATTACK ];

		// A deployed (deployTime 0), NPC-driven core. `activateNPC` keeps the room processing every
		// tick; the loop only drives the controller, so spawning happens solely via the injected intent.
		const spawnScene = (level = 5, decorate?: (room: Room) => void) => simulate({
			W1N1: room => {
				room['#insertObject'](createInvaderCore(corePos, level, 0));
				activateNPC(room, '2');
				decorate?.(room);
			},
		});

		// Inject the NPC-internal `createCreep` intent. NPCs are filtered out of the player intent
		// pipeline, so the processor is otherwise only reachable from the (slice 5) behavior loop.
		const requestCreep = (shard: Shard, coreId: string, creepBody = body, name = 'def') =>
			pushIntentsForRoomNextTick(shard, 'W1N1', '2', { object: { [coreId]: { createCreep: [ creepBody, name ] } } });

		test('createCreep inserts a spawning defender and records the spawn', () => spawnScene()(async ({ shard, tick, peekRoom }) => {
			const coreId = await peekRoom('W1N1', room => findRoomCore(room).id);
			await requestCreep(shard, coreId);
			await tick();
			await peekRoom('W1N1', room => {
				const core = findRoomCore(room);
				assert.ok(core.spawning, 'core reports a spawning record');
				assert.strictEqual(core.spawning.name, 'def');
				assert.strictEqual(core.spawning.needTime, C.INVADER_CORE_CREEP_SPAWN_TIME[5]! * body.length);
				assert.ok(core.spawning.remainingTime > 0, 'spawn timer is still counting down');
				const def = findCreep(room, 'def');
				assert.ok(def, 'defender creep is inserted');
				assert.strictEqual(def['#user'], '2', 'defender is owned by the invader NPC');
				assert.ok(def.spawning, 'defender is still incubating');
				assert.ok(def.pos.isEqualTo(corePos), 'incubating defender sits on the core tile');
			});
		}));

		test('the defender materializes adjacent once the timer elapses', () => spawnScene()(async ({ shard, tick, peekRoom }) => {
			const coreId = await peekRoom('W1N1', room => findRoomCore(room).id);
			await requestCreep(shard, coreId);
			await tick(3);
			await peekRoom('W1N1', room => {
				const core = findRoomCore(room);
				assert.strictEqual(core.spawning, null, 'spawning record clears once the defender spawns');
				const def = findCreep(room, 'def');
				assert.ok(def, 'defender survives the spawn');
				assert.strictEqual(def.spawning, false, 'defender has finished spawning');
				assert.ok(!def.pos.isEqualTo(corePos), 'spawned defender steps off the core tile');
				assert.strictEqual(def.pos.getRangeTo(corePos), 1, 'spawned defender lands adjacent to the core');
			});
		}));

		// All eight neighbors occupied by friendly (non-stompable) creeps: the spawn can find no open
		// tile and must keep retrying without dropping the defender.
		const blockedScene = spawnScene(5, room => {
			for (const pos of iterateNeighbors(corePos)) {
				room['#insertObject'](createCreep(pos, [ C.MOVE ], `block_${pos.x}_${pos.y}`, '2'));
			}
		});

		test('a fully blocked core keeps the spawn pending, then spawns when a tile frees', () => blockedScene(async ({ shard, tick, peekRoom, poke }) => {
			const coreId = await peekRoom('W1N1', room => findRoomCore(room).id);
			await requestCreep(shard, coreId);
			await tick(4);
			await peekRoom('W1N1', room => {
				const core = findRoomCore(room);
				assert.ok(core.spawning, 'spawn stays pending while every neighbor is blocked');
				assert.ok(findCreep(room, 'def')!.spawning, 'defender keeps incubating on the core tile');
				assert.ok(findCreep(room, 'def')!.pos.isEqualTo(corePos), 'blocked defender has not moved off the core');
			});
			// Free one neighbor; the next tick should spawn the defender into the opening.
			await poke('W1N1', undefined, (Game, room) => room['#removeObject'](findCreep(room, 'block_26_25')!));
			await tick(2);
			await peekRoom('W1N1', room => {
				const core = findRoomCore(room);
				assert.strictEqual(core.spawning, null, 'spawn completes once a tile opens');
				const def = findCreep(room, 'def')!;
				assert.strictEqual(def.spawning, false, 'defender finished spawning');
				assert.ok(def.pos.isEqualTo(new RoomPosition(26, 25, 'W1N1')), 'defender spawns into the freed tile');
			});
		}));

		test('createCreep is rejected while the core is already spawning', () => spawnScene()(async ({ shard, tick, peekRoom, poke }) => {
			const coreId = await peekRoom('W1N1', room => findRoomCore(room).id);
			await requestCreep(shard, coreId);
			await tick();
			const result = await poke('W1N1', '2', (Game, room) => findRoomCore(room)['#createCreep'](body, 'other'));
			assert.strictEqual(result, C.ERR_BUSY, 'a busy core rejects a second createCreep');
		}));

		test('createCreep is rejected on a core level that cannot spawn', () => spawnScene(1)(async ({ poke }) => {
			// `INVADER_CORE_CREEP_SPAWN_TIME[1] === 0` — level 1 cores never spawn defenders.
			const result = await poke('W1N1', '2', (Game, room) => findRoomCore(room)['#createCreep'](body, 'def'));
			assert.strictEqual(result, C.ERR_INVALID_TARGET, 'a non-spawning level is rejected');
		}));
	});

	describe('stronghold deployment', () => {
		const corePos = new RoomPosition(25, 25, 'W1N1');
		const findRoomCore = (room: Room) => lookForStructures(room, C.STRUCTURE_INVADER_CORE)[0];

		// The deploy timer elapses the tick after `deployTime` (Game.time === 2); `activateNPC` keeps the
		// room processing across the boundary.
		const deployScene = simulate({
			W1N1: room => {
				const core = createInvaderCore(corePos, 2, 1);
				core['#templateName'] = 'bunker2';
				room['#insertObject'](core);
				activateNPC(room, '2');
			},
		});

		test('deploy replaces the deploy timer with a collapse timer', () => deployScene(async ({ tick, peekRoom }) => {
			await tick(2);
			await peekRoom('W1N1', room => {
				const core = findRoomCore(room)!;
				assert.strictEqual(core.ticksToDeploy, undefined, 'deploy timer cleared once deployed');
				const collapse = core.effects?.find(effect => effect.effect === C.EFFECT_COLLAPSE_TIMER);
				assert.ok(collapse, 'deployed core reports a collapse timer');
				assert.ok(collapse.ticksRemaining > 0, 'collapse timer is counting down');
			});
		}));

		test('deploy spawns the bunker template with loot, scaled ramparts, and a shared timer', () => deployScene(async ({ tick, peekRoom }) => {
			await tick(2);
			await peekRoom('W1N1', (room, Game) => {
				const core = findRoomCore(room)!;
				const collapseTime = core['#collapseTime'];

				// Two towers and two containers distinguish bunker2 from the single-of-each stub.
				const towers = lookForStructures(room, C.STRUCTURE_TOWER);
				const containers = lookForStructures(room, C.STRUCTURE_CONTAINER);
				const ramparts = lookForStructures(room, C.STRUCTURE_RAMPART);
				const roads = lookForStructures(room, C.STRUCTURE_ROAD);
				assert.strictEqual(towers.length, 2, 'bunker2 spawns two towers');
				assert.strictEqual(containers.length, 2, 'bunker2 spawns two containers');

				const tower = towers[0]!;
				const rampart = ramparts[0]!;
				const container = containers[0]!;
				assert.strictEqual(tower.store.getUsedCapacity(C.RESOURCE_ENERGY), C.TOWER_CAPACITY, 'tower deploys at full energy');
				assert.strictEqual(rampart.hits, C.STRONGHOLD_RAMPART_HITS[2], 'rampart hits scale with the template reward level');
				assert.ok(container.store.getUsedCapacity() > 0, 'container deploys carrying a resource reward');
				assert.strictEqual(container.store.getCapacity(), 0, 'reward container is withdraw-only');

				// Co-located structures share a tile: (26,25) holds a container, a road, and a rampart.
				const stackedPos = new RoomPosition(26, 25, 'W1N1');
				assert.ok(lookForStructureAt(room, stackedPos, C.STRUCTURE_CONTAINER), 'container shares the tile');
				assert.ok(lookForStructureAt(room, stackedPos, C.STRUCTURE_ROAD), 'road shares the tile');
				assert.ok(lookForStructureAt(room, stackedPos, C.STRUCTURE_RAMPART), 'rampart shares the tile');

				assert.strictEqual(tower['#user'], '2', 'tower is owned by the invader NPC');
				assert.strictEqual(rampart['#user'], '2', 'rampart is owned by the invader NPC');
				for (const peer of [ tower, rampart, container, roads[0]! ]) {
					assert.strictEqual(peer['#collapseTime'], collapseTime, 'peer shares the core collapse timer');
					assert.deepStrictEqual(peer.effects, [
						{ effect: C.EFFECT_COLLAPSE_TIMER, ticksRemaining: collapseTime - Game.time },
					], 'peer surfaces the shared collapse timer');
				}
				assert.deepStrictEqual(
					[ ...core['#ownedNeutralStructureIds'] ].sort(),
					[ ...containers, ...roads ].map(peer => peer.id).sort(),
					'the core records its unowned peers and no others');
				// Pinned to the collapse time so they don't decay (and read a past expiry, which throws)
				// while the stronghold room sleeps between deploy and collapse.
				for (const peer of [ rampart, container, roads[0]! ]) {
					assert.strictEqual(peer['#nextDecayTime'], collapseTime, 'decaying peer will not decay before collapse');
				}
			});
		}));

		// Player objects sitting on bunker2 tiles when the deploy fires: a creep on a stacked
		// container/road/rampart tile, construction sites above and below the refund threshold, and a
		// road where the template also places one.
		const crushScene = simulate({
			W1N1: room => {
				const core = createInvaderCore(corePos, 2, 1);
				core['#templateName'] = 'bunker2';
				room['#insertObject'](core);
				room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W1N1'), [ C.MOVE ], 'victim', '100'));
				const site = createSite(new RoomPosition(25, 24, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road);
				site.progress = 100;
				room['#insertObject'](site);
				room['#insertObject'](createSite(new RoomPosition(25, 26, 'W1N1'), 'road', '100', C.CONSTRUCTION_COST.road));
				room['#insertObject'](createRoad(new RoomPosition(24, 25, 'W1N1')));
				activateNPC(room, '2');
			},
		});

		test('deploy crushes player objects on template tiles', () => crushScene(async ({ tick, peekRoom }) => {
			await tick(2);
			await peekRoom('W1N1', room => {
				// The creep dies where it stood — once, though its tile carries three template entries.
				assert.strictEqual(room.find(C.FIND_CREEPS).length, 0, 'a creep on a template tile dies');
				const tombstones = room.find(C.FIND_TOMBSTONES);
				assert.strictEqual(tombstones.length, 1, 'the crushed creep is buried exactly once');
				assert.ok(tombstones[0]!.pos.isEqualTo(new RoomPosition(26, 25, 'W1N1')), 'tombstone sits on the crush tile');

				// Sites are removed; only progress above 1 refunds half as dropped energy.
				assert.strictEqual(room.find(C.FIND_CONSTRUCTION_SITES).length, 0, 'sites on template tiles are removed');
				const [ refund, ...extra ] = room.find(C.FIND_DROPPED_RESOURCES);
				assert.strictEqual(extra.length, 0, 'a zero-progress site refunds nothing');
				assert.ok(refund!.pos.isEqualTo(new RoomPosition(25, 24, 'W1N1')), 'refund drops on the site tile');
				assert.strictEqual(refund!.amount, 50, 'refund is half the site progress');

				// The player road is destroyed and the tile now holds the stronghold's own road.
				assert.strictEqual(room.find(C.FIND_RUINS).length, 1, 'the crushed road leaves a Ruin');
				const road = lookForStructureAt(room, new RoomPosition(24, 25, 'W1N1'), C.STRUCTURE_ROAD)!;
				assert.ok(road['#collapseTime'] > 0, 'the surviving road is the stronghold peer');
			});
		}));

		// A lone unowned peer carrying an elapsed collapse timer: the shared base pre-tick must remove it,
		// proving the mechanism works across structure types, not just the core.
		const collapsingPeer = simulate({
			W1N1: room => {
				const container = createContainer(corePos);
				container['#collapseTime'] = 1;
				room['#insertObject'](container);
				activateNPC(room, '2');
			},
		});

		test('a deployed peer is removed silently when its collapse timer elapses', () => collapsingPeer(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				assert.strictEqual(lookForStructures(room, C.STRUCTURE_CONTAINER).length, 0, 'collapsed peer is removed');
				assert.strictEqual(room.find(C.FIND_RUINS).length, 0, 'collapse leaves no Ruin');
				const destroyed = room.getEventLog().find(event => event.event === C.EVENT_OBJECT_DESTROYED);
				assert.strictEqual(destroyed, undefined, 'collapse emits no EVENT_OBJECT_DESTROYED');
			});
		}));

		// A core that took over the room controller (level > 0, owned by '2'), then collapses: the
		// controller is released to neutral while its reservation, when any, is left to expire on its own.
		const ownedThenCollapsing = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = '2';
				room.controller!['#user'] = '2';
				room.controller!['#downgradeTime'] = 1000;
				room.controller!['#upgradeInvulnerableUntil'] = 1000;
				const core = createInvaderCore(corePos, 2, 0);
				core['#collapseTime'] = 1;
				room['#insertObject'](core);
				activateNPC(room, '2');
			},
		});

		test('collapse of a controller-owning core releases the controller to neutral', () => ownedThenCollapsing(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				assert.strictEqual(findRoomCore(room), undefined, 'core removed on collapse');
				assert.strictEqual(room['#user'], null, 'room ownership released');
				assert.strictEqual(room.controller?.level, 0, 'controller downgraded to neutral');
				assert.strictEqual(room.controller.effects, undefined, 'controller invulnerability cleared');
			});
		}));
	});

	describe('stronghold defense', () => {
		const corePos = new RoomPosition(25, 25, 'W1N1');
		// Far enough out that no fixture timer expires while a test ticks.
		const farFuture = 50000;
		const findRoomCore = (room: Room) => lookForStructures(room, C.STRUCTURE_INVADER_CORE)[0];
		const findCreep = (room: Room, name: string) => room.find(C.FIND_CREEPS).find(creep => creep.name === name);
		const energyAt = (room: Room, xx: number, yy: number) =>
			lookForStructureAt(room, new RoomPosition(xx, yy, 'W1N1'), C.STRUCTURE_TOWER)?.store.getUsedCapacity(C.RESOURCE_ENERGY);

		const deployedCore = (level: number, templateName: StructureInvaderCore['#templateName']) => {
			const core = createInvaderCore(corePos, level, 0);
			core['#templateName'] = templateName;
			core['#collapseTime'] = farFuture;
			return core;
		};

		const insertRampart = (room: Room, xx: number, yy: number) => {
			const rampart = createRampart(new RoomPosition(xx, yy, 'W1N1'), '2');
			rampart['#nextDecayTime'] = farFuture;
			room['#insertObject'](rampart);
		};

		const insertTower = (room: Room, xx: number, yy: number, energy: number) => {
			const tower = createTower(new RoomPosition(xx, yy, 'W1N1'), '2');
			tower.store['#add'](C.RESOURCE_ENERGY, energy);
			room['#insertObject'](tower);
		};

		// Level 5 refills unconditionally (`towerRefillChance[5] === 1`). Three towers pin the selection
		// branches: the emptiest protected one wins over a fuller protected one, and an unprotected tower
		// is never refilled no matter how empty.
		const refillScene = simulate({
			W1N1: room => {
				room['#insertObject'](deployedCore(5, 'bunker5'));
				insertTower(room, 26, 25, 5);
				insertRampart(room, 26, 25);
				insertTower(room, 24, 25, 15);
				insertRampart(room, 24, 25);
				insertTower(room, 25, 27, 0);
				activateNPC(room, '2');
			},
		});

		test('the core refills the emptiest rampart-protected tower', () => refillScene(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				assert.strictEqual(energyAt(room, 26, 25), C.TOWER_CAPACITY, 'the emptiest protected tower is refilled to capacity');
				assert.strictEqual(energyAt(room, 24, 25), 15, 'only one tower is refilled per tick');
				assert.strictEqual(energyAt(room, 25, 27), 0, 'an unprotected tower is never refilled');
			});
		}));

		// A hostile pair at range 2 and range 5 from the core: every attacker picks the closest one.
		// The melee defender sits adjacent to it, one ranger at range 2 (rangedAttack), one at range 1
		// (rangedMassAttack).
		const focusScene = simulate({
			W1N1: room => {
				room['#insertObject'](deployedCore(1, 'bunker1'));
				insertTower(room, 24, 24, C.TOWER_CAPACITY);
				room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W1N1'), [ C.ATTACK, C.MOVE ], 'melee', '2'));
				room['#insertObject'](createCreep(new RoomPosition(25, 27, 'W1N1'), [ C.RANGED_ATTACK, C.MOVE ], 'ranged', '2'));
				room['#insertObject'](createCreep(new RoomPosition(26, 26, 'W1N1'), [ C.RANGED_ATTACK, C.MOVE ], 'pointBlank', '2'));
				room['#insertObject'](createCreep(new RoomPosition(27, 25, 'W1N1'), [ ...Fn.map(Fn.range(9), () => C.TOUGH), C.MOVE ], 'near', '100'));
				room['#insertObject'](createCreep(new RoomPosition(30, 25, 'W1N1'), [ C.TOUGH, C.MOVE ], 'far', '100'));
				activateNPC(room, '2');
			},
		});

		test('towers and defenders in reach all attack the hostile closest to the core', () => focusScene(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				const near = findCreep(room, 'near')!;
				const damage = C.TOWER_POWER_ATTACK + C.ATTACK_POWER + C.RANGED_ATTACK_POWER + C.RANGED_ATTACK_POWER;
				assert.strictEqual(near.hits, near.hitsMax - damage, 'tower, melee, ranger, and point-blank ranger all hit the closest hostile');
				const far = findCreep(room, 'far')!;
				assert.strictEqual(far.hits, far.hitsMax, 'the farther hostile is untouched');
			});
		}));

		const bunker2Scene = (decorate?: (room: Room) => void) => simulate({
			W1N1: room => {
				room['#insertObject'](deployedCore(2, 'bunker2'));
				decorate?.(room);
				activateNPC(room, '2');
			},
		});

		test('bunker2 spawns its population slot with the weak defender body', () => bunker2Scene()(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				assert.strictEqual(findRoomCore(room)?.spawning?.name, 'defender0', 'the core starts spawning its missing defender');
				const defender = findCreep(room, 'defender0')!;
				assert.strictEqual(defender.body.length, 30);
				assert.strictEqual(defender.body.filter(part => part.type === C.ATTACK).length, 15);
				assert.strictEqual(defender.body.filter(part => part.type === C.MOVE).length, 15);
				assert.strictEqual(defender.body[0]?.type, C.ATTACK, 'attack parts lead the body');
			});
		}));

		const bunker3Scene = (decorate?: (room: Room) => void) => simulate({
			W1N1: room => {
				room['#insertObject'](deployedCore(3, 'bunker3'));
				decorate?.(room);
				activateNPC(room, '2');
			},
		});

		test('the population spawns one defender at a time', () => bunker3Scene()(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				assert.strictEqual(findRoomCore(room)?.spawning?.name, 'defender0', 'the first missing slot spawns first');
				assert.strictEqual(findCreep(room, 'defender1'), undefined, 'the second slot waits its turn');
			});
		}));

		test('a filled population slot is skipped', () => bunker3Scene(room => {
			room['#insertObject'](createCreep(new RoomPosition(26, 25, 'W1N1'), [ C.ATTACK, C.MOVE ], 'defender0', '2'));
		})(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				assert.strictEqual(findRoomCore(room)?.spawning?.name, 'defender1', 'the missing slot spawns while the live defender keeps its name');
			});
		}));

		// A rampart walkway from the defender to the hostile's doorstep: simple-melee movement is
		// confined to ramparts, so the defender advances along it and attacks from its end.
		const walkwayScene = bunker2Scene(room => {
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W1N1'), [ C.ATTACK, C.MOVE ], 'defender0', '2'));
			insertRampart(room, 24, 25);
			insertRampart(room, 25, 24);
			insertRampart(room, 26, 25);
			room['#insertObject'](createCreep(new RoomPosition(27, 25, 'W1N1'), [ ...Fn.map(Fn.range(9), () => C.TOUGH), C.MOVE ], 'intruder', '100'));
		});

		test('a defender advances along ramparts and attacks from the walkway end', () => walkwayScene(async ({ tick, peekRoom }) => {
			await tick(2);
			await peekRoom('W1N1', room => {
				const defender = findCreep(room, 'defender0')!;
				assert.ok(defender.pos.isEqualTo(new RoomPosition(26, 25, 'W1N1')), 'defender walked the rampart tiles toward the intruder');
			});
			await tick();
			await peekRoom('W1N1', room => {
				const intruder = findCreep(room, 'intruder')!;
				assert.ok(intruder.hits < intruder.hitsMax, 'defender attacks once adjacent');
			});
		}));

		// No rampart path reaches the hostile: the defender holds its rampart rather than chasing over
		// open ground.
		const isolatedScene = bunker2Scene(room => {
			room['#insertObject'](createCreep(new RoomPosition(24, 25, 'W1N1'), [ C.ATTACK, C.MOVE ], 'defender0', '2'));
			insertRampart(room, 24, 25);
			room['#insertObject'](createCreep(new RoomPosition(27, 25, 'W1N1'), [ C.TOUGH, C.MOVE ], 'intruder', '100'));
		});

		test('a defender never leaves the ramparts to chase', () => isolatedScene(async ({ tick, peekRoom }) => {
			await tick(2);
			await peekRoom('W1N1', room => {
				const defender = findCreep(room, 'defender0')!;
				assert.ok(defender.pos.isEqualTo(new RoomPosition(24, 25, 'W1N1')), 'defender holds its rampart when no rampart path reaches the hostile');
			});
		}));

		// While the deploy timer runs, only the controller is driven — no refill, no attacks.
		const deployingScene = simulate({
			W1N1: room => {
				const core = createInvaderCore(corePos, 5, farFuture);
				core['#templateName'] = 'bunker5';
				room['#insertObject'](core);
				insertTower(room, 26, 25, 0);
				insertRampart(room, 26, 25);
				room['#insertObject'](createCreep(new RoomPosition(27, 25, 'W1N1'), [ C.TOUGH, C.MOVE ], 'scout', '100'));
				activateNPC(room, '2');
			},
		});

		test('a deploying core runs no defense behaviors', () => deployingScene(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W1N1', room => {
				assert.strictEqual(energyAt(room, 26, 25), 0, 'no tower refill while deploying');
				const scout = findCreep(room, 'scout')!;
				assert.strictEqual(scout.hits, scout.hitsMax, 'no attacks while deploying');
				assert.strictEqual(findRoomCore(room)?.spawning, null, 'no population spawning while deploying');
			});
		}));
	});
});
