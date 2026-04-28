import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { calculatePower, create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { lookForStructures } from 'xxscreeps/mods/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create as createLab } from './lab.js';

// Helper to create a lab with resources pre-loaded
export function createLabWithResources(pos: RoomPosition, owner: string, mineral?: string, mineralAmount?: number, energy?: number) {
	const lab = createLab(pos, owner);
	if (energy !== undefined) {
		lab.store['#add'](C.RESOURCE_ENERGY, energy);
	}
	if (mineral !== undefined && mineralAmount !== undefined) {
		lab.store['#add'](mineral as any, mineralAmount);
	}
	return lab;
}

describe('Chemistry', () => {

	// =========================================================================
	// runReaction
	// =========================================================================
	describe('runReaction', () => {
		const reactionSim = simulate({
			W1N1: room => {
				// Output lab in the center
				room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), '100'));
				// Source lab 1 with Hydrogen (within range 2)
				room['#insertObject'](createLabWithResources(
					new RoomPosition(25, 23, 'W1N1'), '100',
					C.RESOURCE_HYDROGEN, 100, 0));
				// Source lab 2 with Oxygen (within range 2)
				room['#insertObject'](createLabWithResources(
					new RoomPosition(25, 27, 'W1N1'), '100',
					C.RESOURCE_OXYGEN, 100, 0));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('runReaction produces correct compound', () => reactionSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => !lab.mineralType)!;
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				assert.strictEqual(output.runReaction(labH, labO), C.OK);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => lab.mineralType === 'OH')!;
				assert.ok(output, 'output lab should contain OH');
				assert.strictEqual(output.store[C.RESOURCE_HYDROXIDE], C.LAB_REACTION_AMOUNT);
			});
		}));

		test('runReaction uses per-product cooldown', () => reactionSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => !lab.mineralType)!;
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				output.runReaction(labH, labO);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => lab.mineralType === 'OH')!;
				// OH has REACTION_TIME of 20, not the generic LAB_COOLDOWN of 10. The
				// observable cooldown is REACTION_TIME - 1: vanilla writes cooldownTime
				// in the processor at gameTime = T and reads it in user code at
				// runtimeData.time = T+1.
				assert.strictEqual(output.cooldown, C.REACTION_TIME.OH - 1,
					`cooldown should be REACTION_TIME.OH - 1 (${C.REACTION_TIME.OH - 1}), not LAB_COOLDOWN (${C.LAB_COOLDOWN})`);
			});
		}));

		test('runReaction deducts reagents from source labs', () => reactionSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => !lab.mineralType)!;
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				output.runReaction(labH, labO);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				assert.strictEqual(labH.store[C.RESOURCE_HYDROGEN], 100 - C.LAB_REACTION_AMOUNT);
				assert.strictEqual(labO.store[C.RESOURCE_OXYGEN], 100 - C.LAB_REACTION_AMOUNT);
			});
		}));

		test('runReaction action log points to correct source labs', () => reactionSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => !lab.mineralType)!;
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				output.runReaction(labH, labO);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => lab.mineralType === 'OH')!;
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				const actionLog = output['#actionLog'];
				const r1 = actionLog.find(action => action.type === 'reaction1');
				const r2 = actionLog.find(action => action.type === 'reaction2');
				assert.ok(r1 && r2, 'both reaction action log entries should exist');
				assert.strictEqual(r1.x, labH.pos.x, 'reaction1 x should match source lab 1');
				assert.strictEqual(r1.y, labH.pos.y, 'reaction1 y should match source lab 1');
				assert.strictEqual(r2.x, labO.pos.x, 'reaction2 x should match source lab 2');
				assert.strictEqual(r2.y, labO.pos.y, 'reaction2 y should match source lab 2');
			});
		}));

		test('runReaction fails on cooldown', () => reactionSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => !lab.mineralType)!;
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				output.runReaction(labH, labO);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const output = labs.find(lab => lab.mineralType === 'OH')!;
				const labH = labs.find(lab => lab.mineralType === C.RESOURCE_HYDROGEN)!;
				const labO = labs.find(lab => lab.mineralType === C.RESOURCE_OXYGEN)!;
				assert.strictEqual(output.runReaction(labH, labO), C.ERR_TIRED);
			});
		}));
	});

	// =========================================================================
	// boostCreep
	// =========================================================================
	describe('boostCreep', () => {
		const boostSim = simulate({
			W1N1: room => {
				// Lab with TOUGH boost mineral (GO = damage reduction) + energy
				room['#insertObject'](createLabWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					'GO', 300, 2000));
				// Lab with WORK boost mineral (UO = harvest) + energy
				room['#insertObject'](createLabWithResources(
					new RoomPosition(26, 25, 'W1N1'), '100',
					'UO', 300, 2000));
				// Creep with mixed body adjacent to labs
				room['#insertObject'](createCreep(
					new RoomPosition(25, 26, 'W1N1'),
					[ C.TOUGH, C.TOUGH, C.WORK, C.WORK, C.WORK, C.CARRY, C.MOVE, C.MOVE ],
					'boostme', '100'));
				// Creep far away (out of range)
				room['#insertObject'](createCreep(
					new RoomPosition(10, 10, 'W1N1'),
					[ C.TOUGH, C.MOVE ],
					'faraway', '100'));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('boostCreep method exists', () => boostSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const lab = labs[0];
				assert.strictEqual(typeof lab.boostCreep, 'function',
					'StructureLab should have a boostCreep method');
			});
		}));

		test('boostCreep returns OK for valid target', () => boostSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				const result = labGO.boostCreep(Game.creeps.boostme);
				assert.strictEqual(result, C.OK, 'boostCreep should return OK');
			});
		}));

		test('boostCreep applies boost to body parts', () => boostSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				labGO.boostCreep(Game.creeps.boostme);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.boostme;
				const boostedParts = creep.body.filter(part => part.boost);
				assert.ok(boostedParts.length > 0, 'creep should have boosted parts');
				// GO boosts TOUGH parts
				const boostedTough = creep.body.filter(part => part.type === C.TOUGH && part.boost === 'GO');
				assert.strictEqual(boostedTough.length, 2, 'both TOUGH parts should be boosted with GO');
			});
		}));

		test('body parts match vanilla own-property shape', () => boostSim(async ({ player, tick }) => {
			await player('100', Game => {
				// Pre-boost: every part is `{ hits, type }` — no `boost` own property
				for (const part of Game.creeps.boostme.body) {
					assert.ok(!('boost' in part), `unboosted ${part.type} part must not have own 'boost' property`);
				}
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				labs.find(lab => lab.mineralType === 'GO')!.boostCreep(Game.creeps.boostme);
			});
			await tick();
			await player('100', Game => {
				// Post-boost: only the boosted (TOUGH) parts gain a `boost` own property
				for (const part of Game.creeps.boostme.body) {
					if (part.type === C.TOUGH) {
						assert.ok('boost' in part, 'boosted TOUGH part must have own `boost` property');
					} else {
						assert.ok(!('boost' in part), `unboosted ${part.type} part must not have own 'boost' property`);
					}
				}
			});
		}));

		test('boostCreep deducts resources from lab', () => boostSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				labGO.boostCreep(Game.creeps.boostme);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				// 2 TOUGH parts * LAB_BOOST_MINERAL (30) = 60 mineral consumed
				assert.strictEqual(labGO.store[C.RESOURCE_GHODIUM_OXIDE], 300 - (2 * C.LAB_BOOST_MINERAL));
				// 2 TOUGH parts * LAB_BOOST_ENERGY (20) = 40 energy consumed
				assert.strictEqual(labGO.store[C.RESOURCE_ENERGY], 2000 - (2 * C.LAB_BOOST_ENERGY));
			});
		}));

		test('boostCreep respects bodyPartsCount limit', () => boostSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labUO = labs.find(lab => lab.mineralType === 'UO')!;
				// Only boost 1 of 3 WORK parts
				labUO.boostCreep(Game.creeps.boostme, 1);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.boostme;
				const boostedWork = creep.body.filter(part => part.type === C.WORK && part.boost === 'UO');
				assert.strictEqual(boostedWork.length, 1, 'only 1 WORK part should be boosted');
			});
		}));

		test('boostCreep fails out of range', () => boostSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				const result = labGO.boostCreep(Game.creeps.faraway);
				assert.strictEqual(result, C.ERR_NOT_IN_RANGE);
			});
		}));

		test('boostCreep fails with insufficient resources', () => boostSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				// Lab with GO has enough for TOUGH, but let's test with UO lab on a creep without WORK
				// Actually test: bodyPartsCount > available matching unboosted parts
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				const result = labGO.boostCreep(Game.creeps.boostme, 5);
				// Only 2 TOUGH parts available, requesting 5
				assert.strictEqual(result, C.ERR_NOT_FOUND);
			});
		}));

		test('boostCreep TOUGH parts boosted first, others last-to-first', () => boostSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labUO = labs.find(lab => lab.mineralType === 'UO')!;
				// Boost 2 of 3 WORK parts — should boost last two (reversed order)
				labUO.boostCreep(Game.creeps.boostme, 2);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.boostme;
				const workParts = creep.body.filter(part => part.type === C.WORK);
				// body is [TOUGH, TOUGH, WORK, WORK, WORK, CARRY, MOVE, MOVE]
				// Non-TOUGH parts are boosted last-to-first, so WORK indices 4,3 get boosted (not 2)
				assert.ok(!workParts[0].boost, 'first WORK part should NOT be boosted');
				assert.strictEqual(workParts[1].boost, 'UO', 'second WORK part should be boosted');
				assert.strictEqual(workParts[2].boost, 'UO', 'third WORK part should be boosted');
			});
		}));
	});

	// =========================================================================
	// reverseReaction
	// =========================================================================
	describe('reverseReaction', () => {
		const reverseSim = simulate({
			W1N1: room => {
				// Source lab with OH compound to decompose
				room['#insertObject'](createLabWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					'OH', 100, 0));
				// Destination lab 1 (empty, will receive H)
				room['#insertObject'](createLab(new RoomPosition(25, 23, 'W1N1'), '100'));
				// Destination lab 2 (empty, will receive O)
				room['#insertObject'](createLab(new RoomPosition(25, 27, 'W1N1'), '100'));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('reverseReaction method exists', () => reverseSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const lab = labs[0];
				assert.strictEqual(typeof lab.reverseReaction, 'function',
					'StructureLab should have a reverseReaction method');
			});
		}));

		test('reverseReaction returns OK for valid decomposition', () => reverseSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labOH = labs.find(lab => lab.mineralType === 'OH')!;
				const empties = labs.filter(lab => !lab.mineralType);
				const result = labOH.reverseReaction(empties[0], empties[1]);
				assert.strictEqual(result, C.OK, 'reverseReaction should return OK');
			});
		}));

		test('reverseReaction decomposes compound into reagents', () => reverseSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labOH = labs.find(lab => lab.mineralType === 'OH')!;
				const empties = labs.filter(lab => !lab.mineralType);
				labOH.reverseReaction(empties[0], empties[1]);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				// OH decomposes to H + O
				const labOH = labs.find(lab => lab.pos.isEqualTo(25, 25))!;
				assert.strictEqual(labOH.store[C.RESOURCE_HYDROXIDE], 100 - C.LAB_REACTION_AMOUNT,
					'compound should be consumed');
				// The two destination labs should have received reagents
				const destLabs = labs.filter(lab => !lab.pos.isEqualTo(25, 25));
				const minerals = destLabs.map(lab => lab.mineralType).sort();
				assert.deepStrictEqual(minerals, [ C.RESOURCE_HYDROGEN, C.RESOURCE_OXYGEN ].sort(),
					'destination labs should contain H and O');
			});
		}));

		test('reverseReaction sets cooldown', () => reverseSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labOH = labs.find(lab => lab.mineralType === 'OH')!;
				const empties = labs.filter(lab => !lab.mineralType);
				labOH.reverseReaction(empties[0], empties[1]);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labOH = labs.find(lab => lab.pos.isEqualTo(25, 25))!;
				// Observable cooldown is REACTION_TIME - 1; see runReaction test above.
				assert.strictEqual(labOH.cooldown, C.REACTION_TIME.OH - 1,
					'cooldown should match REACTION_TIME - 1 for the compound');
			});
		}));

		test('reverseReaction fails with lab1 == lab2', () => reverseSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labOH = labs.find(lab => lab.mineralType === 'OH')!;
				const empty = labs.find(lab => !lab.mineralType)!;
				const result = labOH.reverseReaction(empty, empty);
				assert.strictEqual(result, C.ERR_INVALID_ARGS);
			});
		}));

		test('reverseReaction fails on cooldown', () => reverseSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labOH = labs.find(lab => lab.mineralType === 'OH')!;
				const empties = labs.filter(lab => !lab.mineralType);
				labOH.reverseReaction(empties[0], empties[1]);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labOH = labs.find(lab => lab.pos.isEqualTo(25, 25))!;
				const others = labs.filter(lab => !lab.pos.isEqualTo(25, 25));
				assert.strictEqual(labOH.reverseReaction(others[0], others[1]), C.ERR_TIRED);
			});
		}));
	});

	// =========================================================================
	// unboostCreep
	// =========================================================================
	describe('unboostCreep', () => {
		const unboostSim = simulate({
			W1N1: room => {
				// Lab for unboosting (needs no specific mineral)
				room['#insertObject'](createLab(new RoomPosition(25, 25, 'W1N1'), '100'));
				// Lab with GO to apply boosts first
				room['#insertObject'](createLabWithResources(
					new RoomPosition(27, 25, 'W1N1'), '100',
					'GO', 300, 2000));
				// Creep to be boosted then unboosted
				room['#insertObject'](createCreep(
					new RoomPosition(26, 25, 'W1N1'),
					[ C.TOUGH, C.TOUGH, C.MOVE, C.MOVE ],
					'unboosted', '100'));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('unboostCreep method exists', () => unboostSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const lab = labs[0];
				assert.strictEqual(typeof lab.unboostCreep, 'function',
					'StructureLab should have an unboostCreep method');
			});
		}));

		test('unboostCreep removes all boosts', () => unboostSim(async ({ player, tick }) => {
			// First boost the creep
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				assert.strictEqual(labGO.boostCreep(Game.creeps.unboosted), C.OK);
			});
			await tick();
			// Verify boost was applied, then unboost
			await player('100', Game => {
				const creep = Game.creeps.unboosted;
				assert.ok(creep.body.some(part => part.boost === 'GO'), 'creep should be boosted');
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const unboostLab = labs.find(lab => !lab.mineralType)!;
				assert.strictEqual(unboostLab.unboostCreep(Game.creeps.unboosted), C.OK);
			});
			await tick();
			// Verify boosts removed
			await player('100', Game => {
				const creep = Game.creeps.unboosted;
				const boostedParts = creep.body.filter(part => part.boost);
				assert.strictEqual(boostedParts.length, 0, 'all boosts should be removed');
				// Vanilla parity: unboost must drop the `boost` own property entirely, not leave it set to undefined.
				for (const part of creep.body) {
					assert.ok(!('boost' in part), `unboosted ${part.type} part must not have own 'boost' property`);
				}
			});
		}));

		test('unboostCreep drops resources at creep position', () => unboostSim(async ({ player, tick }) => {
			// Boost then unboost
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				labGO.boostCreep(Game.creeps.unboosted);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const unboostLab = labs.find(lab => !lab.mineralType)!;
				unboostLab.unboostCreep(Game.creeps.unboosted);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.unboosted;
				// LAB_UNBOOST_MINERAL (15) per boosted part: 2 TOUGH parts = 30 GO dropped
				// After 1 tick of decay: ceil(30/1000) = 1 lost
				const expectedDrop = 2 * C.LAB_UNBOOST_MINERAL;
				const expectedAfterDecay = expectedDrop - Math.ceil(expectedDrop / C.ENERGY_DECAY);
				const resources = creep.room.lookForAt(C.LOOK_RESOURCES, creep.pos);
				const goResource = resources.find(resource => resource.resourceType === 'GO');
				assert.ok(goResource, 'GO resource should be dropped at creep position');
				assert.strictEqual(goResource.amount, expectedAfterDecay,
					'dropped amount should be LAB_UNBOOST_MINERAL per boosted part (minus 1 tick decay)');
			});
		}));

		test('unboostCreep sets cooldown on lab', () => unboostSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				labGO.boostCreep(Game.creeps.unboosted);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const unboostLab = labs.find(lab => !lab.mineralType)!;
				unboostLab.unboostCreep(Game.creeps.unboosted);
			});
			await tick();
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const unboostLab = labs.find(lab => lab.pos.isEqualTo(25, 25))!;
				assert.ok(unboostLab.cooldown > 0, 'lab should have a cooldown after unboosting');
			});
		}));

		test('unboostCreep fails on unboosted creep', () => unboostSim(async ({ player }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const lab = labs.find(lab => !lab.mineralType)!;
				const result = lab.unboostCreep(Game.creeps.unboosted);
				assert.strictEqual(result, C.ERR_NOT_FOUND,
					'should fail when creep has no boosts');
			});
		}));

		test('unboostCreep fails out of range', () => unboostSim(async ({ player, tick, poke }) => {
			// Boost the creep first
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labGO = labs.find(lab => lab.mineralType === 'GO')!;
				labGO.boostCreep(Game.creeps.unboosted);
			});
			await tick();
			// Move the creep far away via poke
			await poke('W1N1', '100', Game => {
				const creep = Game.creeps.unboosted;
				creep.pos.x = 10;
				creep.pos.y = 10;
			});
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const lab = labs.find(lab => !lab.mineralType)!;
				const result = lab.unboostCreep(Game.creeps.unboosted);
				assert.strictEqual(result, C.ERR_NOT_IN_RANGE);
			});
		}));
	});

	// =========================================================================
	// Boost multiplier effects
	// =========================================================================
	describe('boost multipliers', () => {
		const boostEffectSim = simulate({
			W1N1: room => {
				// Lab with UO (harvest boost) + energy
				room['#insertObject'](createLabWithResources(
					new RoomPosition(25, 25, 'W1N1'), '100',
					'UO', 300, 2000));
				// Lab with KH (carry boost) + energy
				room['#insertObject'](createLabWithResources(
					new RoomPosition(26, 25, 'W1N1'), '100',
					'KH', 300, 2000));
				// Lab with ZO (fatigue/move boost) + energy
				room['#insertObject'](createLabWithResources(
					new RoomPosition(24, 25, 'W1N1'), '100',
					'ZO', 300, 2000));
				// Lab with UH (attack boost) + energy
				room['#insertObject'](createLabWithResources(
					new RoomPosition(27, 25, 'W1N1'), '100',
					'UH', 300, 2000));
				// Worker creep adjacent to labs
				room['#insertObject'](createCreep(
					new RoomPosition(25, 26, 'W1N1'),
					[ C.WORK, C.WORK, C.CARRY, C.CARRY, C.MOVE, C.MOVE ],
					'worker', '100'));
				// Attacker creep adjacent to labs
				room['#insertObject'](createCreep(
					new RoomPosition(26, 26, 'W1N1'),
					[ C.ATTACK, C.ATTACK, C.MOVE ],
					'attacker', '100'));
				room['#level'] = 7;
				room['#user'] =
					room.controller!['#user'] = '100';
			},
		});

		test('carry boost increases store capacity', () => boostEffectSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labKH = labs.find(lab => lab.mineralType === 'KH')!;
				labKH.boostCreep(Game.creeps.worker);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.worker;
				// KH gives capacity * 2 per boosted CARRY part
				// 2 CARRY parts * CARRY_CAPACITY(50) * 2 = 200 (up from 100)
				assert.strictEqual(creep.store.getCapacity(), 2 * C.CARRY_CAPACITY * C.BOOSTS.carry.KH.capacity,
					'boosted carry capacity should reflect KH multiplier');
			});
		}));

		test('harvest boost increases work power', () => boostEffectSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labUO = labs.find(lab => lab.mineralType === 'UO')!;
				labUO.boostCreep(Game.creeps.worker);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.worker;
				// 2 WORK parts boosted with UO (harvest × 3)
				const power = calculatePower(creep, C.WORK, C.HARVEST_POWER, 'harvest');
				assert.strictEqual(power, 2 * C.HARVEST_POWER * C.BOOSTS.work.UO.harvest,
					'boosted harvest power should reflect UO multiplier');
			});
		}));

		test('move boost increases fatigue reduction', () => boostEffectSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labZO = labs.find(lab => lab.mineralType === 'ZO')!;
				labZO.boostCreep(Game.creeps.worker);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.worker;
				// 2 MOVE parts boosted with ZO (fatigue × 2)
				const power = calculatePower(creep, C.MOVE, 2, 'fatigue');
				assert.strictEqual(power, 2 * 2 * C.BOOSTS.move.ZO.fatigue,
					'boosted move power should reflect ZO multiplier');
			});
		}));

		test('attack boost increases attack power', () => boostEffectSim(async ({ player, tick }) => {
			await player('100', Game => {
				const labs = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_LAB);
				const labUH = labs.find(lab => lab.mineralType === 'UH')!;
				labUH.boostCreep(Game.creeps.attacker);
			});
			await tick();
			await player('100', Game => {
				const creep = Game.creeps.attacker;
				// 2 ATTACK parts boosted with UH (attack × 2)
				const power = calculatePower(creep, C.ATTACK, C.ATTACK_POWER, 'attack');
				assert.strictEqual(power, 2 * C.ATTACK_POWER * C.BOOSTS.attack.UH.attack,
					'boosted attack power should reflect UH multiplier');
			});
		}));
	});
});
