import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import { create as createContainer } from 'xxscreeps/mods/classic/resource/container.js';
import { create as createResource } from 'xxscreeps/mods/classic/resource/resource.js';
import { Source } from 'xxscreeps/mods/classic/source/source.js';
import { create as createExtension } from 'xxscreeps/mods/classic/spawn/extension.js';
import { create as createSpawn } from 'xxscreeps/mods/classic/spawn/spawn.js';
import { lookForStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import * as C from 'xxscreeps:mods/constants';
import { Creep, create } from './creep.js';

describe('mods/classic/creep', () => {
	describe('death', () => {
		const nearDeath = simulate({
			W0N0: room => {
				const creep = create(new RoomPosition(25, 25, 'W0N0'), [ C.MOVE ], 'creep', '100');
				creep['#ageTime'] = 2;
				room['#insertObject'](creep);
			},
		});

		test('dies of old age', () => nearDeath(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.creep?.ticksToLive, 2);
			});
			await tick(2);
			await player('100', Game => {
				assert.strictEqual(Game.creeps.creep?.ticksToLive, undefined);
			});
		}));

		const tombstoneAwaken = simulate({
			W1N1: room => {
				const creep = create(new RoomPosition(20, 3, 'W1N1'), [ C.MOVE ], 'creep', '100');
				room['#insertObject'](creep);
			},
			W1N2: room => {
				const creep = create(new RoomPosition(10, 10, 'W1N2'), [ C.TOUGH, C.TOUGH ], 'goodbye', '100');
				creep['#ageTime'] = 1;
				room['#insertObject'](creep);
			},
		});
		test('dies in an empty room with a tombstone', () => tombstoneAwaken(async ({ player, tick }) => {
			await tick(3, {
				100: ({ creeps: { creep } }) => {
					creep?.moveTo(new RoomPosition(10, 10, 'W1N2'));
				},
			});
			// this is actually a test of the processing sleeping queue. 'creep' enters the room while
			// 'goodbye's tombstone has slept the room. this wakes the room during the finalization stage.
			await player('100', Game => {
				Game.creeps.creep?.suicide();
			});
			await tick(8);
		}));
	});

	describe('movement', () => {
		const movement = simulate({
			W0N0: room => {
				room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0'), [ C.MOVE ], 'topLeft', '100'));
				room['#insertObject'](create(new RoomPosition(26, 25, 'W0N0'), [ C.MOVE ], 'topRight', '100'));
				room['#insertObject'](create(new RoomPosition(25, 26, 'W0N0'), [ C.MOVE ], 'bottomLeft', '100'));
				room['#insertObject'](create(new RoomPosition(26, 26, 'W0N0'), [ C.MOVE, C.MOVE ], 'bottomRight', '100'));
			},
		});

		test('following', () => movement(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.topLeft?.move(C.RIGHT);
				Game.creeps.topRight?.move(C.RIGHT);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.topLeft?.pos.isEqualTo(26, 25));
				assert.ok(Game.creeps.topRight?.pos.isEqualTo(27, 25));
			});
		}));

		test('swapping', () => movement(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.bottomLeft?.move(C.TOP);
				Game.creeps.bottomRight?.move(C.LEFT);
				Game.creeps.topLeft?.move(C.RIGHT);
				Game.creeps.topRight?.move(C.LEFT);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.topLeft?.pos.isEqualTo(26, 25));
				assert.ok(Game.creeps.topRight?.pos.isEqualTo(25, 25));
				assert.ok(Game.creeps.bottomLeft?.pos.isEqualTo(25, 26));
				assert.ok(Game.creeps.bottomRight?.pos.isEqualTo(26, 26));
			});
		}));

		test('swapping second', () => movement(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.topLeft?.move(C.RIGHT);
				Game.creeps.topRight?.move(C.LEFT);
				Game.creeps.bottomLeft?.move(C.TOP);
				Game.creeps.bottomRight?.move(C.LEFT);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.topLeft?.pos.isEqualTo(26, 25));
				assert.ok(Game.creeps.topRight?.pos.isEqualTo(25, 25));
				assert.ok(Game.creeps.bottomLeft?.pos.isEqualTo(25, 26));
				assert.ok(Game.creeps.bottomRight?.pos.isEqualTo(26, 26));
			});
		}));

		test('swapping against fast', () => movement(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.bottomRight?.move(C.TOP);
				Game.creeps.topLeft?.move(C.RIGHT);
				Game.creeps.topRight?.move(C.LEFT);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.topLeft?.pos.isEqualTo(26, 25));
				assert.ok(Game.creeps.topRight?.pos.isEqualTo(25, 25));
				assert.ok(Game.creeps.bottomRight?.pos.isEqualTo(26, 26));
			});
		}));

		/*
		// nb: This will pass 1/3 of the time.
		test('with followers', () => movement(async({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.bottomLeft.move(C.TOP_LEFT);
				Game.creeps.topLeft.move(C.LEFT);
				Game.creeps.topRight.move(C.LEFT);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.topLeft.pos.isEqualTo(24, 25, 'W0N0'));
				assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(25, 26, 'W0N0'));
			});
		}));
		*/

		const fastSlow = simulate({
			W0N0: room => {
				room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0'), [ C.MOVE, C.MOVE ], 'topLeft', '100'));
				room['#insertObject'](create(new RoomPosition(25, 26, 'W0N0'), [ C.MOVE ], 'bottomLeft', '100'));
			},
		});

		test('fast wins', () => fastSlow(async ({ player, tick }) => {
			await player('100', Game => {
				Game.creeps.bottomLeft?.move(C.TOP_LEFT);
				Game.creeps.topLeft?.move(C.LEFT);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.bottomLeft?.pos.isEqualTo(25, 26));
				assert.ok(Game.creeps.topLeft?.pos.isEqualTo(24, 25));
			});
		}));

		const hostile = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#safeModeUntil'] = 100;
				room['#insertObject'](create(new RoomPosition(25, 25, 'W1N1'), [ C.MOVE ], 'creep', '100'));
				room['#insertObject'](create(new RoomPosition(25, 26, 'W1N1'), [ C.MOVE, C.MOVE ], 'creep', '101'));
			},
		});
		test('safe mode', () => hostile(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.creep?.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.creep?.pos.isEqualTo(25, 26));
				assert.strictEqual(Game.creeps.creep?.move(C.TOP), C.OK);
			});
			await player('101', Game => {
				assert.strictEqual(Game.creeps.creep?.move(C.TOP), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.creep?.pos.isEqualTo(25, 25));
			});
		}));

		const enterSameTileOwnerObstacle = simulate({
			W2N2: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#safeModeUntil'] = 100;
				room['#insertObject'](create(new RoomPosition(20, 20, 'W2N2'), [ C.MOVE ], 'owner', '100'));
				room['#insertObject'](create(new RoomPosition(20, 21, 'W2N2'), [ C.MOVE ], 'ownerObstacle', '100'));
				room['#insertObject'](create(new RoomPosition(20, 22, 'W2N2'), [ C.MOVE, C.MOVE ], 'hostile2', '101'));
			},
		});
		test('safe mode - friendly obstacle', () => enterSameTileOwnerObstacle(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.owner?.move(C.BOTTOM), C.OK);
			});
			await player('101', Game => {
				assert.strictEqual(Game.creeps.hostile2?.move(C.TOP), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.ownerObstacle?.pos.isEqualTo(20, 21));
				assert.ok(Game.creeps.owner?.pos.isEqualTo(20, 20));
			});
			await player('101', Game => {
				assert.ok(Game.creeps.hostile2?.pos.isEqualTo(20, 22));
			});
		}));

		const enterSameTileHostileObstacle = simulate({
			W2N2: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#safeModeUntil'] = 100;
				room['#insertObject'](create(new RoomPosition(20, 20, 'W2N2'), [ C.MOVE ], 'owner', '100'));
				room['#insertObject'](create(new RoomPosition(20, 21, 'W2N2'), [ C.MOVE ], 'hostileObstacle', '101'));
				room['#insertObject'](create(new RoomPosition(20, 22, 'W2N2'), [ C.MOVE, C.MOVE ], 'hostile2', '101'));
			},
		});
		test('safe mode - hostile obstacle', () => enterSameTileHostileObstacle(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.owner?.move(C.BOTTOM), C.OK);
			});
			await player('101', Game => {
				assert.strictEqual(Game.creeps.hostile2?.move(C.TOP), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.owner?.pos.isEqualTo(20, 21));
			});
			await player('101', Game => {
				assert.ok(Game.creeps.hostileObstacle?.pos.isEqualTo(20, 21));
				assert.ok(Game.creeps.hostile2?.pos.isEqualTo(20, 22));
			});
		}));

		const enterPossiblyFreeTile = simulate({
			W2N2: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				room['#safeModeUntil'] = 100;
				room['#insertObject'](create(new RoomPosition(20, 20, 'W2N2'), [ C.MOVE ], 'owner', '100'));
				room['#insertObject'](create(new RoomPosition(19, 21, 'W2N2'), [ C.MOVE ], 'ownerObstacle', '100'));
				room['#insertObject'](create(new RoomPosition(20, 21, 'W2N2'), [ C.MOVE ], 'hostile', '101'));
				room['#insertObject'](create(new RoomPosition(20, 22, 'W2N2'), [ C.MOVE, C.MOVE ], 'hostile2', '101'));
			},
		});
		test('safe mode - hostile obstacle w/ follower', () => enterPossiblyFreeTile(async ({ player, tick }) => {
			await player('100', Game => {
				// try to move into hostile position
				assert.ok(Game.creeps.owner?.pos.isEqualTo(20, 20));
				assert.strictEqual(Game.creeps.owner?.move(C.BOTTOM), C.OK);
			});
			await player('101', Game => {
				// try to move into ownerObstacle position
				assert.strictEqual(Game.creeps.hostile?.move(C.LEFT), C.OK);
				// try to move into hostile position
				assert.strictEqual(Game.creeps.hostile2?.move(C.TOP), C.OK);
			});
			await tick();
			await player('101', Game => {
				// hostile & hostile2 did not move
				assert.ok(Game.creeps.hostile?.pos.isEqualTo(20, 21));
				assert.ok(Game.creeps.hostile2?.pos.isEqualTo(20, 22));
			});
			await player('100', Game => {
				// owner moved to hostile position
				assert.ok(Game.creeps.owner?.pos.isEqualTo(20, 21));
				assert.ok(Game.creeps.ownerObstacle?.pos.isEqualTo(19, 21));
			});
		}));

		test('safe mode - hostile conflict w/ follower', () => enterPossiblyFreeTile(async ({ player, tick }) => {
			await player('100', Game => {
				// move to [21,21]
				assert.strictEqual(Game.creeps.owner?.move(C.BOTTOM_RIGHT), C.OK);
			});
			await player('101', Game => {
				// move to [21,21]
				assert.strictEqual(Game.creeps.hostile?.move(C.RIGHT), C.OK);
				// move to `hostile`
				assert.strictEqual(Game.creeps.hostile2?.move(C.TOP), C.OK);
			});
			await tick();
			await player('100', Game => {
				assert.ok(Game.creeps.owner?.pos.isEqualTo(21, 21));
			});
			await player('101', Game => {
				assert.ok(Game.creeps.hostile?.pos.isEqualTo(20, 21));
				assert.ok(Game.creeps.hostile2?.pos.isEqualTo(20, 22));
			});
		}));

		const slowOnEdge = simulate({
			W0N0: room => {
				room['#insertObject'](create(new RoomPosition(24, 5, 'W0N0'), [ C.MOVE, C.TOUGH, C.TOUGH ], 'slow', '100'));
			},
		});

		test('edge fatigue', () => slowOnEdge(async ({ player, tick }) => {
			await tick(11, {
				100: ({ creeps: { slow } }) => {
					slow?.moveTo(new RoomPosition(24, 48, 'W0N1'));
				},
			});
			await player('100', ({ creeps: { slow } }) => {
				assert.ok(slow?.pos.isEqualTo(24, 48));
			});
		}));
	});

	// These tests are adapted from the vanilla server:
	// https://github.com/screeps/engine/blob/9aa2e113355b35789d975bea2ef49aec37c15185/spec/engine/processor/intents/movementSpec.js#L277-L433
	// The coordinates are shifted up by 20 because there's a bunch of rough terrain in the middle of
	// W0N0 which would obstruct movement.
	describe('pull', () => {
		const sim = simulate({
			W0N0: room => {
				room['#insertObject'](create(new RoomPosition(23, 5, 'W0N0'), [ C.TOUGH ], 'noMove', '100'));
				room['#insertObject'](create(new RoomPosition(24, 4, 'W0N0'), [ C.MOVE, C.TOUGH, C.TOUGH ], 'halfSpeed', '100'));
				room['#insertObject'](create(new RoomPosition(25, 3, 'W0N0'), [ C.MOVE, C.TOUGH, C.TOUGH ], 'halfSpeed2', '100'));
				room['#insertObject'](create(new RoomPosition(24, 5, 'W0N0'), [ C.MOVE, C.TOUGH ], 'fullSpeed', '100'));
			},
		});

		test('direction syntax', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed?.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed!), C.OK);
				assert.strictEqual(halfSpeed?.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed?.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed?.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed?.fatigue, 0);
				assert.strictEqual(fullSpeed?.fatigue, 2);
			});
		}));

		test('creep', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed?.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed!), C.OK);
				assert.strictEqual(halfSpeed?.move(fullSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed?.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed?.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed?.fatigue, 0);
				assert.strictEqual(fullSpeed?.fatigue, 2);
			});
		}));

		test('without follow', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed?.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed!), C.OK);
				assert.strictEqual(halfSpeed?.move(C.TOP_LEFT), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed?.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed?.pos.isEqualTo(23, 3));
				assert.strictEqual(halfSpeed?.fatigue, 2);
				assert.strictEqual(fullSpeed?.fatigue, 0);
			});
		}));

		test('no move parts', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { noMove, fullSpeed } }) => {
				assert.strictEqual(fullSpeed?.move(C.TOP_LEFT), C.OK);
				assert.strictEqual(fullSpeed.pull(noMove!), C.OK);
				assert.strictEqual(noMove?.move(fullSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { noMove, fullSpeed } }) => {
				assert.ok(fullSpeed?.pos.isEqualTo(23, 4));
				assert.ok(noMove?.pos.isEqualTo(24, 5));
				assert.strictEqual(noMove?.fatigue, 0);
				assert.strictEqual(fullSpeed?.fatigue, 2);
			});
		}));

		test('with fatigue', () => sim(async ({ player, poke, tick }) => {
			await poke('W0N0', '100', Game => {
				Game.creeps.halfSpeed!.fatigue = 2;
			});
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(halfSpeed?.move(fullSpeed!), C.OK);
				assert.strictEqual(fullSpeed?.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed?.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed?.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed?.fatigue, 0);
				assert.strictEqual(fullSpeed?.fatigue, 4);
			});
		}));

		test('cycle', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(halfSpeed?.move(halfSpeed2!), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2!), C.OK);
				assert.strictEqual(halfSpeed2?.move(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed2.pull(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				assert.ok(halfSpeed?.pos.isEqualTo(25, 3));
				assert.ok(halfSpeed2?.pos.isEqualTo(24, 4));
				assert.ok((halfSpeed?.fatigue === 0) !== (halfSpeed2?.fatigue === 0));
			});
		}));

		test('move chain', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { fullSpeed, halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(fullSpeed?.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed!), C.OK);
				assert.strictEqual(halfSpeed?.move(fullSpeed), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2!), C.OK);
				assert.strictEqual(halfSpeed2?.move(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2, fullSpeed } }) => {
				assert.ok(fullSpeed?.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed?.pos.isEqualTo(24, 5));
				assert.ok(halfSpeed2?.pos.isEqualTo(24, 4));
				assert.strictEqual(fullSpeed?.fatigue, 4);
				assert.strictEqual(halfSpeed?.fatigue, 0);
				assert.strictEqual(halfSpeed2?.fatigue, 0);
			});
		}));

		test('move chain w/ fatigue', () => sim(async ({ player, tick, poke }) => {
			await poke('W0N0', '100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				halfSpeed!.fatigue = 2;
				halfSpeed2!.fatigue = 2;
			});
			await player('100', ({ creeps: { fullSpeed, halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(fullSpeed?.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed!), C.OK);
				assert.strictEqual(halfSpeed?.move(fullSpeed), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2!), C.OK);
				assert.strictEqual(halfSpeed2?.move(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2, fullSpeed } }) => {
				assert.ok(fullSpeed?.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed?.pos.isEqualTo(24, 5));
				assert.ok(halfSpeed2?.pos.isEqualTo(24, 4));
				assert.strictEqual(fullSpeed?.fatigue, 8);
				assert.strictEqual(halfSpeed?.fatigue, 0);
				assert.strictEqual(halfSpeed2?.fatigue, 0);
			});
		}));
	});

	// When a creep dies, buryCreep() inserts a tombstone via deferred #insertObject. The Tick loop
	// captures array length before iterating, so the new tombstone's Tick processor never runs on the
	// death tick. setActive() ensures the room wakes next tick so the tombstone can register its
	// decay timer.
	describe('tombstone', () => {
		const dying = simulate({
			W5N5: room => {
				const creep = create(new RoomPosition(25, 25, 'W5N5'), [ C.MOVE ], 'mortal', '100');
				creep['#ageTime'] = 2;
				room['#insertObject'](creep);
			},
		});

		test('appears after age death and decays', () => dying(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W5N5', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_CREEPS).length, 1, 'creep should be alive after tick 1');
			});
			await tick();
			await peekRoom('W5N5', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_CREEPS).length, 0, 'creep should be dead');
				assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 1, 'tombstone should exist');
			});
			// 1 MOVE part × TOMBSTONE_DECAY_PER_PART ticks
			await tick(C.TOMBSTONE_DECAY_PER_PART);
			await peekRoom('W5N5', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 0,
					'tombstone should be cleaned up after decay window');
			});
		}));

		const firstTickDeath = simulate({
			W4N4: room => {
				const creep = create(new RoomPosition(25, 25, 'W4N4'), [ C.MOVE ], 'ephemeral', '100');
				creep['#ageTime'] = 1;
				room['#insertObject'](creep);
			},
		});

		test('first-tick death decays', () => firstTickDeath(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W4N4', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 1, 'tombstone should exist');
			});
			await tick(C.TOMBSTONE_DECAY_PER_PART + 5);
			await peekRoom('W4N4', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 0,
					'first-tick tombstone should decay');
			});
		}));

		const boostedSuicide = simulate({
			W7N7: room => {
				const creep = create(new RoomPosition(25, 25, 'W7N7'), [ C.ATTACK ], 'boosted', '100');
				creep.body[0]!.boost = C.RESOURCE_UTRIUM_HYDRIDE;
				room['#insertObject'](creep);
			},
		});

		test('suicide reclaims body energy and boost mineral', () => boostedSuicide(async ({ player, tick, peekRoom }) => {
			await player('100', Game => {
				Game.creeps.boosted?.suicide();
			});
			await tick();
			await peekRoom('W7N7', room => {
				const tombs = room['#lookFor'](C.LOOK_TOMBSTONES);
				assert.strictEqual(tombs.length, 1);
				const tomb = tombs[0];
				assert.strictEqual(tomb?.store[C.RESOURCE_ENERGY], 19);
				assert.strictEqual(tomb.store[C.RESOURCE_UTRIUM_HYDRIDE], 5);
			});
		}));

		const claimSuicide = simulate({
			W8N8: room => {
				const creep = create(new RoomPosition(25, 25, 'W8N8'), [ C.CLAIM ], 'claimer', '100');
				// Spawn code seats CLAIM creeps at CREEP_CLAIM_LIFE_TIME; create() only knows
				// CREEP_LIFE_TIME. Retarget #ageTime so the reclaim rate picks the CLAIM branch.
				creep['#ageTime'] = creep['#ageTime'] - C.CREEP_LIFE_TIME + C.CREEP_CLAIM_LIFE_TIME;
				room['#insertObject'](creep);
			},
		});

		test('CLAIM body reclaims at CREEP_CLAIM_LIFE_TIME rate', () => claimSuicide(async ({ player, tick, peekRoom }) => {
			await player('100', Game => {
				Game.creeps.claimer?.suicide();
			});
			await tick();
			await peekRoom('W8N8', room => {
				const tombs = room['#lookFor'](C.LOOK_TOMBSTONES);
				assert.strictEqual(tombs.length, 1);
				// Using CREEP_LIFE_TIME instead would yield floor(600 * 0.2 * (599/1500)) = 47.
				assert.strictEqual(tombs[0]?.store[C.RESOURCE_ENERGY], 119);
			});
		}));
	});

	describe('transfer', () => {
		function transferFixture(opts: {
			target: 'source' | 'spawn';
			targetFar?: boolean;
			spawnEnergy?: number;
			creepEnergy?: number;
			creepHydrogen?: number;
		}) {
			return simulate({
				W1N1: room => {
					room['#level'] = 1;
					room['#user'] = room.controller!['#user'] = '100';
					const carrier = create(new RoomPosition(25, 25, 'W1N1'), [ C.CARRY ], 'carrier', '100');
					if (opts.creepEnergy !== undefined) carrier.store['#add'](C.RESOURCE_ENERGY, opts.creepEnergy);
					if (opts.creepHydrogen !== undefined) carrier.store['#add'](C.RESOURCE_HYDROGEN, opts.creepHydrogen);
					room['#insertObject'](carrier);
					const targetPos = new RoomPosition(opts.targetFar ? 35 : 25, opts.targetFar ? 35 : 26, 'W1N1');
					if (opts.target === 'source') {
						const src = createRoomObject(new Source(), targetPos);
						src.energy = src.energyCapacity = C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
						room['#insertObject'](src);
					} else {
						const spawn = createSpawn(targetPos, '100', 'destination');
						spawn.store['#subtract'](C.RESOURCE_ENERGY, C.SPAWN_ENERGY_START);
						if (opts.spawnEnergy !== undefined) spawn.store['#add'](C.RESOURCE_ENERGY, opts.spawnEnergy);
						room['#insertObject'](spawn);
					}
				},
			});
		}

		test('invalid target without a store', () => transferFixture({
			target: 'source', creepEnergy: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				const target = Game.rooms.W1N1?.lookForAt(C.LOOK_SOURCES, 25, 26)[0];
				assert.strictEqual(Game.creeps.carrier?.transfer(target as never, C.RESOURCE_ENERGY), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid target before invalid capacity', () => transferFixture({
			target: 'source', creepHydrogen: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				const target = Game.rooms.W1N1?.lookForAt(C.LOOK_SOURCES, 25, 26)[0];
				assert.strictEqual(Game.creeps.carrier?.transfer(target as never, C.RESOURCE_HYDROGEN), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid target before range', () => transferFixture({
			target: 'source', targetFar: true, creepEnergy: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				const target = Game.rooms.W1N1?.lookForAt(C.LOOK_SOURCES, 35, 35)[0];
				assert.strictEqual(Game.creeps.carrier?.transfer(target as never, C.RESOURCE_ENERGY), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid target before not enough', () => transferFixture({
			target: 'source',
		})(async ({ player }) => {
			await player('100', Game => {
				const target = Game.rooms.W1N1?.lookForAt(C.LOOK_SOURCES, 25, 26)[0];
				assert.strictEqual(Game.creeps.carrier?.transfer(target as never, C.RESOURCE_ENERGY), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid target before full', () => transferFixture({
			target: 'source', creepEnergy: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				const target = Game.rooms.W1N1?.lookForAt(C.LOOK_SOURCES, 25, 26)[0];
				assert.strictEqual(Game.creeps.carrier?.transfer(target as never, C.RESOURCE_ENERGY), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid target before not enough amount', () => transferFixture({
			target: 'source', creepEnergy: 10,
		})(async ({ player }) => {
			await player('100', Game => {
				const target = Game.rooms.W1N1?.lookForAt(C.LOOK_SOURCES, 25, 26)[0];
				assert.strictEqual(Game.creeps.carrier?.transfer(target as never, C.RESOURCE_ENERGY, 20), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid target before full amount', () => transferFixture({
			target: 'source', creepEnergy: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				const target = Game.rooms.W1N1?.lookForAt(C.LOOK_SOURCES, 25, 26)[0];
				assert.strictEqual(Game.creeps.carrier?.transfer(target as never, C.RESOURCE_ENERGY, 20), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid capacity before range', () => transferFixture({
			target: 'spawn', targetFar: true, creepHydrogen: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_HYDROGEN), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid capacity before not enough', () => transferFixture({
			target: 'spawn',
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_HYDROGEN), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid capacity before not enough amount', () => transferFixture({
			target: 'spawn', creepEnergy: 10,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_HYDROGEN, 20), C.ERR_INVALID_TARGET);
			});
		}));

		test('invalid args before range', () => transferFixture({
			target: 'spawn', targetFar: true, creepEnergy: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.carrier?.transfer(Game.spawns.destination!, 'not_a_resource' as never, -1),
					C.ERR_INVALID_ARGS,
				);
			});
		}));

		test('not enough before full', () => transferFixture({
			target: 'spawn', spawnEnergy: C.SPAWN_ENERGY_CAPACITY,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_ENERGY),
					C.ERR_NOT_ENOUGH_RESOURCES,
				);
			});
		}));

		test('not enough before not enough amount', () => transferFixture({
			target: 'spawn',
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_ENERGY, 20),
					C.ERR_NOT_ENOUGH_RESOURCES,
				);
			});
		}));

		test('not enough before full amount', () => transferFixture({
			target: 'spawn', spawnEnergy: C.SPAWN_ENERGY_CAPACITY - 10,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_ENERGY, 20),
					C.ERR_NOT_ENOUGH_RESOURCES,
				);
			});
		}));

		test('full before not enough amount', () => transferFixture({
			target: 'spawn', spawnEnergy: C.SPAWN_ENERGY_CAPACITY, creepEnergy: 10,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_ENERGY, 20), C.ERR_FULL);
			});
		}));

		test('full before full amount', () => transferFixture({
			target: 'spawn', spawnEnergy: C.SPAWN_ENERGY_CAPACITY, creepEnergy: 50,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_ENERGY, 20), C.ERR_FULL);
			});
		}));

		test('not enough amount before full amount', () => transferFixture({
			target: 'spawn', spawnEnergy: C.SPAWN_ENERGY_CAPACITY - 10, creepEnergy: 10,
		})(async ({ player }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.carrier?.transfer(Game.spawns.destination!, C.RESOURCE_ENERGY, 20),
					C.ERR_NOT_ENOUGH_RESOURCES,
				);
			});
		}));
	});

	describe('pickup', () => {
		const fullAndOutOfRange = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const picker = create(new RoomPosition(25, 25, 'W1N1'), [ C.CARRY, C.MOVE ], 'picker', '100');
				picker.store['#add'](C.RESOURCE_ENERGY, C.CARRY_CAPACITY);
				room['#insertObject'](picker);
				room['#insertObject'](createResource(new RoomPosition(30, 30, 'W1N1'), C.RESOURCE_ENERGY, 50));
			},
		});

		test('full before range', () => fullAndOutOfRange(async ({ player }) => {
			await player('100', Game => {
				const pile = Game.rooms.W1N1?.find(C.FIND_DROPPED_RESOURCES)[0];
				assert.strictEqual(Game.creeps.picker?.pickup(pile!), C.ERR_FULL);
			});
		}));
	});

	describe('withdraw', () => {
		const safeModeHostile = simulate({
			W9N9: room => {
				room['#level'] = 3;
				room['#user'] = room.controller!['#user'] = '101';
				room['#safeModeUntil'] = 100;

				room['#insertObject'](create(new RoomPosition(25, 25, 'W9N9'), [ C.CARRY, C.MOVE ], 'invalidCapacity', '100'));
				room['#insertObject'](createExtension(new RoomPosition(26, 25, 'W9N9'), 3, '100'));

				room['#insertObject'](create(new RoomPosition(10, 10, 'W9N9'), [ C.CARRY, C.MOVE ], 'range', '100'));
				const farContainer = createContainer(new RoomPosition(20, 20, 'W9N9'));
				farContainer.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](farContainer);

				const full = create(new RoomPosition(25, 30, 'W9N9'), [ C.CARRY, C.MOVE ], 'full', '100');
				full.store['#add'](C.RESOURCE_ENERGY, C.CARRY_CAPACITY);
				room['#insertObject'](full);
				const fullContainer = createContainer(new RoomPosition(26, 30, 'W9N9'));
				fullContainer.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](fullContainer);

				const fullAmount = create(new RoomPosition(25, 32, 'W9N9'), [ C.CARRY, C.MOVE ], 'fullAmount', '100');
				fullAmount.store['#add'](C.RESOURCE_ENERGY, C.CARRY_CAPACITY - 1);
				room['#insertObject'](fullAmount);
				const fullAmountContainer = createContainer(new RoomPosition(26, 32, 'W9N9'));
				fullAmountContainer.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](fullAmountContainer);

				room['#insertObject'](create(new RoomPosition(25, 34, 'W9N9'), [ C.CARRY, C.MOVE ], 'notEnough', '100'));
				room['#insertObject'](createContainer(new RoomPosition(26, 34, 'W9N9')));
			},
		});

		test('safemode not owner before invalid capacity', () => safeModeHostile(async ({ player }) => {
			await player('100', Game => {
				const extension = lookForStructures(Game.rooms.W9N9, C.STRUCTURE_EXTENSION)[0]!;
				assert.strictEqual(Game.creeps.invalidCapacity!.withdraw(extension, C.RESOURCE_HYDROGEN), C.ERR_NOT_OWNER);
			});
		}));

		test('safemode not owner before range', () => safeModeHostile(async ({ player }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W9N9, C.STRUCTURE_CONTAINER)
					.find(container => container.pos.isEqualTo(20, 20))!;
				assert.strictEqual(Game.creeps.range!.withdraw(container, C.RESOURCE_ENERGY), C.ERR_NOT_OWNER);
			});
		}));

		test('safemode not owner before full', () => safeModeHostile(async ({ player }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W9N9, C.STRUCTURE_CONTAINER)
					.find(container => container.pos.isEqualTo(26, 30))!;
				assert.strictEqual(Game.creeps.full!.withdraw(container, C.RESOURCE_ENERGY), C.ERR_NOT_OWNER);
			});
		}));

		test('safemode not owner before full amount', () => safeModeHostile(async ({ player }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W9N9, C.STRUCTURE_CONTAINER)
					.find(container => container.pos.isEqualTo(26, 32))!;
				assert.strictEqual(Game.creeps.fullAmount!.withdraw(container, C.RESOURCE_ENERGY, 2), C.ERR_NOT_OWNER);
			});
		}));

		test('safemode not owner before not enough', () => safeModeHostile(async ({ player }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W9N9, C.STRUCTURE_CONTAINER)
					.find(container => container.pos.isEqualTo(26, 34))!;
				assert.strictEqual(Game.creeps.notEnough!.withdraw(container, C.RESOURCE_ENERGY), C.ERR_NOT_OWNER);
			});
		}));

		const friendly = simulate({
			W7N7: room => {
				room['#level'] = 3;
				room['#user'] = room.controller!['#user'] = '100';
				room['#insertObject'](create(new RoomPosition(25, 25, 'W7N7'), [ C.CARRY ], 'creep', '100'));
				room['#insertObject'](createContainer(new RoomPosition(26, 25, 'W7N7')));
				room['#insertObject'](createContainer(new RoomPosition(24, 25, 'W7N7')));
				room['#insertObject'](createRampart(new RoomPosition(24, 25, 'W7N7'), '101'));
				room['#insertObject'](createExtension(new RoomPosition(45, 30, 'W7N7'), 3, '100'));
			},
		});

		test('invalid args before invalid target', () => friendly(async ({ player }) => {
			await player('100', Game => {
				// @ts-expect-error
				assert.strictEqual(Game.creeps.creep!.withdraw(null, 'fake'), C.ERR_INVALID_ARGS);
			});
		}));

		test('invalid args before target not owner', () => friendly(async ({ player }) => {
			await player('100', Game => {
				const blocked = lookForStructures(Game.rooms.W7N7, C.STRUCTURE_CONTAINER)
					.find(container => container.pos.isEqualTo(24, 25))!;
				// @ts-expect-error
				assert.strictEqual(Game.creeps.creep!.withdraw(blocked, 'fake'), C.ERR_INVALID_ARGS);
			});
		}));

		test('invalid args before range', () => friendly(async ({ player }) => {
			await player('100', Game => {
				const far = lookForStructures(Game.rooms.W7N7, C.STRUCTURE_EXTENSION)[0]!;
				// @ts-expect-error
				assert.strictEqual(Game.creeps.creep!.withdraw(far, 'fake'), C.ERR_INVALID_ARGS);
			});
		}));

		test('invalid capacity before range', () => friendly(async ({ player }) => {
			await player('100', Game => {
				const far = lookForStructures(Game.rooms.W7N7, C.STRUCTURE_EXTENSION)[0]!;
				assert.strictEqual(Game.creeps.creep!.withdraw(far, C.RESOURCE_HYDROGEN), C.ERR_INVALID_TARGET);
			});
		}));

		test('full before not enough', () => friendly(async ({ player, poke }) => {
			await poke('W7N7', '100', Game => {
				Game.creeps.creep!.store['#add'](C.RESOURCE_ENERGY, C.CARRY_CAPACITY);
			});
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W7N7, C.STRUCTURE_CONTAINER)
					.find(container => container.pos.isEqualTo(26, 25))!;
				assert.strictEqual(Game.creeps.creep!.withdraw(container, C.RESOURCE_ENERGY), C.ERR_FULL);
			});
		}));

		test('not enough when creep has room', () => friendly(async ({ player }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W7N7, C.STRUCTURE_CONTAINER)
					.find(container => container.pos.isEqualTo(26, 25))!;
				assert.strictEqual(Game.creeps.creep!.withdraw(container, C.RESOURCE_ENERGY), C.ERR_NOT_ENOUGH_RESOURCES);
			});
		}));
	});

	describe('event log', () => {
		const ageOut = simulate({
			W5N5: room => {
				const creep = create(new RoomPosition(25, 25, 'W5N5'), [ C.MOVE ], 'mortal', '100');
				creep['#ageTime'] = 1;
				room['#insertObject'](creep);
			},
		});

		test('death emits EVENT_OBJECT_DESTROYED with type creep', () => ageOut(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W5N5', room => {
				const log = room.getEventLog();
				const destroyed = log.find(event => event.event === C.EVENT_OBJECT_DESTROYED);
				assert.ok(destroyed, 'expected a death event on the tick the creep aged out');
				assert.ok(destroyed.data, 'expected nested data payload');
				assert.strictEqual(destroyed.data.type, 'creep');
			});
		}));

		const transferSim = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const giver = create(new RoomPosition(25, 25, 'W1N1'), [ C.CARRY ], 'giver', '100');
				giver.store['#add'](C.RESOURCE_ENERGY, 10);
				room['#insertObject'](giver);
				const receiver = create(new RoomPosition(26, 25, 'W1N1'), [ C.CARRY ], 'receiver', '100');
				room['#insertObject'](receiver);
			},
		});

		test('transfer emits EVENT_TRANSFER with source and target ids', () => transferSim(async ({ player, tick }) => {
			await player('100', Game => {
				assert.strictEqual(
					Game.creeps.giver?.transfer(Game.creeps.receiver!, C.RESOURCE_ENERGY, 5),
					C.OK,
				);
			});
			await tick();
			await player('100', Game => {
				const log = Game.rooms.W1N1!.getEventLog();
				const transfer = log.find(event => event.event === C.EVENT_TRANSFER);
				assert.ok(transfer, 'expected EVENT_TRANSFER');
				assert.strictEqual(transfer.objectId, Game.creeps.giver?.id);
				assert.ok(transfer.data, 'expected nested data payload');
				assert.strictEqual(transfer.data.targetId, Game.creeps.receiver?.id);
				assert.strictEqual(transfer.data.resourceType, C.RESOURCE_ENERGY);
				assert.strictEqual(transfer.data.amount, 5);
			});
		}));

		const withdrawSim = simulate({
			W1N1: room => {
				room['#level'] = 1;
				room['#user'] = room.controller!['#user'] = '100';
				const container = createContainer(new RoomPosition(25, 25, 'W1N1'));
				container.store['#add'](C.RESOURCE_ENERGY, 50);
				room['#insertObject'](container);
				room['#insertObject'](create(new RoomPosition(26, 25, 'W1N1'), [ C.CARRY ], 'taker', '100'));
			},
		});

		// Vanilla flips the roles on withdraw: source structure is `objectId`, creep is `targetId`.
		test('withdraw flips objectId/targetId vs transfer', () => withdrawSim(async ({ player, tick }) => {
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_CONTAINER)[0]!;
				assert.strictEqual(Game.creeps.taker?.withdraw(container, C.RESOURCE_ENERGY, 7), C.OK);
			});
			await tick();
			await player('100', Game => {
				const container = lookForStructures(Game.rooms.W1N1, C.STRUCTURE_CONTAINER)[0]!;
				const log = Game.rooms.W1N1!.getEventLog();
				const transfer = log.find(event => event.event === C.EVENT_TRANSFER);
				assert.ok(transfer, 'expected EVENT_TRANSFER');
				assert.strictEqual(transfer.objectId, container.id);
				assert.ok(transfer.data, 'expected nested data payload');
				assert.strictEqual(transfer.data.targetId, Game.creeps.taker?.id);
				assert.strictEqual(transfer.data.resourceType, C.RESOURCE_ENERGY);
				assert.strictEqual(transfer.data.amount, 7);
			});
		}));
	});

	describe('id-string constructor', () => {
		const sim = simulate({
			W3N3: room => {
				const creep = create(new RoomPosition(25, 25, 'W3N3'), [ C.WORK ], 'subject', '100');
				creep.fatigue = 3;
				creep.store['#add'](C.RESOURCE_ENERGY, 25);
				room['#insertObject'](creep);
			},
		});

		test('view reads match the canonical handle', () => sim(async ({ player }) => {
			await player('100', Game => {
				const original = Game.creeps.subject!;
				// @ts-expect-error
				const view = new Creep(original.id);
				assert.ok(view instanceof Creep);
				assert.strictEqual(view.id, original.id);
				assert.strictEqual(view.name, original.name);
				assert.strictEqual(view.body.length, original.body.length);
				assert.strictEqual(view.pos.x, original.pos.x);
				assert.strictEqual(view.pos.y, original.pos.y);
				assert.strictEqual(view.pos.roomName, original.pos.roomName);
				assert.strictEqual(view.store[C.RESOURCE_ENERGY], original.store[C.RESOURCE_ENERGY]);
				assert.strictEqual(view.hits, original.hits);
				assert.strictEqual(view.fatigue, original.fatigue);
			});
		}));

		test('view writes do not propagate to the canonical handle', () => sim(async ({ player }) => {
			await player('100', Game => {
				const original = Game.creeps.subject!;
				const hits = original.hits;
				const fatigue = original.fatigue;
				// @ts-expect-error
				const view = new Creep(original.id);
				view.hits = 50;
				view.fatigue = 1;
				assert.strictEqual(original.hits, hits);
				assert.strictEqual(original.fatigue, fatigue);
				// nb: Diverges from vanilla, which defines most getters as non-configurable
				assert.strictEqual(view.hits, 50);
				assert.strictEqual(view.fatigue, 1);
			});
		}));
	});
});
