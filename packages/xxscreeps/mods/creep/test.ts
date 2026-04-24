import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';
import { create } from './creep.js';

describe('Movement', () => {
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
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.RIGHT);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert.ok(Game.creeps.topRight.pos.isEqualTo(27, 25));
		});
	}));

	test('swapping', () => movement(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.bottomLeft.move(C.TOP);
			Game.creeps.bottomRight.move(C.LEFT);
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert.ok(Game.creeps.topRight.pos.isEqualTo(25, 25));
			assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(25, 26));
			assert.ok(Game.creeps.bottomRight.pos.isEqualTo(26, 26));
		});
	}));

	test('swapping second', () => movement(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.LEFT);
			Game.creeps.bottomLeft.move(C.TOP);
			Game.creeps.bottomRight.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert.ok(Game.creeps.topRight.pos.isEqualTo(25, 25));
			assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(25, 26));
			assert.ok(Game.creeps.bottomRight.pos.isEqualTo(26, 26));
		});
	}));

	test('swapping against fast', () => movement(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.bottomRight.move(C.TOP);
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert.ok(Game.creeps.topRight.pos.isEqualTo(25, 25));
			assert.ok(Game.creeps.bottomRight.pos.isEqualTo(26, 26));
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
			Game.creeps.bottomLeft.move(C.TOP_LEFT);
			Game.creeps.topLeft.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(25, 26));
			assert.ok(Game.creeps.topLeft.pos.isEqualTo(24, 25));
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
			assert.strictEqual(Game.creeps.creep.move(C.BOTTOM), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.creep.pos.isEqualTo(25, 26));
			assert.strictEqual(Game.creeps.creep.move(C.TOP), C.OK);
		});
		await player('101', Game => {
			assert.strictEqual(Game.creeps.creep.move(C.TOP), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.creep.pos.isEqualTo(25, 25));
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
			assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
		});
		await player('101', Game => {
			assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.ownerObstacle.pos.isEqualTo(20, 21));
			assert.ok(Game.creeps.owner.pos.isEqualTo(20, 20));
		});
		await player('101', Game => {
			assert.ok(Game.creeps.hostile2.pos.isEqualTo(20, 22));
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
			assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
		});
		await player('101', Game => {
			assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.owner.pos.isEqualTo(20, 21));
		});
		await player('101', Game => {
			assert.ok(Game.creeps.hostileObstacle.pos.isEqualTo(20, 21));
			assert.ok(Game.creeps.hostile2.pos.isEqualTo(20, 22));
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
			assert.ok(Game.creeps.owner.pos.isEqualTo(20, 20));
			assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
		});
		await player('101', Game => {
			// try to move into ownerObstacle position
			assert.strictEqual(Game.creeps.hostile.move(C.LEFT), C.OK);
			// try to move into hostile position
			assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
		});
		await tick();
		await player('101', Game => {
			// hostile & hostile2 did not move
			assert.ok(Game.creeps.hostile.pos.isEqualTo(20, 21));
			assert.ok(Game.creeps.hostile2.pos.isEqualTo(20, 22));
		});
		await player('100', Game => {
			// owner moved to hostile position
			assert.ok(Game.creeps.owner.pos.isEqualTo(20, 21));
			assert.ok(Game.creeps.ownerObstacle.pos.isEqualTo(19, 21));
		});
	}));

	test('safe mode - hostile conflict w/ follower', () => enterPossiblyFreeTile(async ({ player, tick }) => {
		await player('100', Game => {
			// move to [21,21]
			assert.strictEqual(Game.creeps.owner.move(C.BOTTOM_RIGHT), C.OK);
		});
		await player('101', Game => {
			// move to [21,21]
			assert.strictEqual(Game.creeps.hostile.move(C.RIGHT), C.OK);
			// move to `hostile`
			assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert.ok(Game.creeps.owner.pos.isEqualTo(21, 21));
		});
		await player('101', Game => {
			assert.ok(Game.creeps.hostile.pos.isEqualTo(20, 21));
			assert.ok(Game.creeps.hostile2.pos.isEqualTo(20, 22));
		});
	}));

	// https://github.com/laverdet/xxscreeps/issues/58
	// When a creep dies, buryCreep() inserts a tombstone via deferred #insertObject.
	// The Tick loop captures array length before iterating, so the new tombstone's
	// Tick processor never runs on the death tick. setActive() ensures the room
	// wakes next tick so the tombstone can register its decay timer.
	describe('Tombstone decay', () => {
		const dying = simulate({
			W5N5: room => {
				const creep = create(new RoomPosition(25, 25, 'W5N5'), [ C.MOVE ], 'mortal', '100');
				creep['#ageTime'] = 3;
				room['#insertObject'](creep);
			},
		});

		test('tombstone appears after age death and decays', () => dying(async ({ tick, peekRoom }) => {
			await tick();
			await peekRoom('W5N5', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_CREEPS).length, 1, 'creep should be alive after tick 1');
			});
			await tick();
			await peekRoom('W5N5', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_CREEPS).length, 0, 'creep should be dead');
				assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 1, 'tombstone should exist');
			});
			// 1 MOVE part × TOMBSTONE_DECAY_PER_PART ticks, plus buffer
			await tick(C.TOMBSTONE_DECAY_PER_PART + 5);
			await peekRoom('W5N5', room => {
				assert.strictEqual(room['#lookFor'](C.LOOK_TOMBSTONES).length, 0,
					'tombstone should be cleaned up after decay window');
			});
		}));

		const firstTickDeath = simulate({
			W4N4: room => {
				const creep = create(new RoomPosition(25, 25, 'W4N4'), [ C.MOVE ], 'ephemeral', '100');
				creep['#ageTime'] = 2;
				room['#insertObject'](creep);
			},
		});

		test('first-tick death tombstone decays', () => firstTickDeath(async ({ tick, peekRoom }) => {
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
	});

	describe('Tombstone store', () => {
		const boostedSuicide = simulate({
			W7N7: room => {
				const creep = create(new RoomPosition(25, 25, 'W7N7'), [ C.ATTACK ], 'boosted', '100');
				creep.body[0].boost = C.RESOURCE_UTRIUM_HYDRIDE;
				room['#insertObject'](creep);
			},
		});

		test('suicide reclaims body energy and boost mineral', () => boostedSuicide(async ({ player, tick, peekRoom }) => {
			await player('100', Game => {
				Game.creeps.boosted.suicide();
			});
			await tick();
			await peekRoom('W7N7', room => {
				const tombs = room['#lookFor'](C.LOOK_TOMBSTONES);
				assert.strictEqual(tombs.length, 1);
				const tomb = tombs[0];
				assert.strictEqual(tomb.store[C.RESOURCE_ENERGY], 19);
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

		test('CLAIM body uses CREEP_CLAIM_LIFE_TIME for the reclaim rate', () => claimSuicide(async ({ player, tick, peekRoom }) => {
			await player('100', Game => {
				Game.creeps.claimer.suicide();
			});
			await tick();
			await peekRoom('W8N8', room => {
				const tombs = room['#lookFor'](C.LOOK_TOMBSTONES);
				assert.strictEqual(tombs.length, 1);
				// Using CREEP_LIFE_TIME instead would yield floor(600 * 0.2 * (599/1500)) = 47.
				assert.strictEqual(tombs[0].store[C.RESOURCE_ENERGY], 119);
			});
		}));
	});

	describe('Room', () => {
		const sim = simulate({
			W0N0: room => {
				room['#insertObject'](create(new RoomPosition(24, 5, 'W0N0'), [ C.MOVE, C.TOUGH, C.TOUGH ], 'slow', '100'));
			},
		});

		test('edge fatigue', () => sim(async ({ player, tick }) => {
			await tick(11, {
				100: ({ creeps: { slow } }) => {
					slow.moveTo(new RoomPosition(24, 48, 'W0N1'));
				},
			});
			await player('100', ({ creeps: { slow } }) => {
				assert.ok(slow.pos.isEqualTo(24, 48));
			});
		}));
	});

	// These tests are adapted from the vanilla server:
	// https://github.com/screeps/engine/blob/9aa2e113355b35789d975bea2ef49aec37c15185/spec/engine/processor/intents/movementSpec.js#L277-L433
	// The coordinates are shifted up by 20 because there's a bunch of rough terrain in the middle of
	// W0N0 which would obstruct movement.
	describe('Pull', () => {
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
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 2);
			});
		}));

		test('creep', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(fullSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 2);
			});
		}));

		test('without follow', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(C.TOP_LEFT), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed.pos.isEqualTo(23, 3));
				assert.strictEqual(halfSpeed.fatigue, 2);
				assert.strictEqual(fullSpeed.fatigue, 0);
			});
		}));

		test('no move parts', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { noMove, fullSpeed } }) => {
				assert.strictEqual(fullSpeed.move(C.TOP_LEFT), C.OK);
				assert.strictEqual(fullSpeed.pull(noMove), C.OK);
				assert.strictEqual(noMove.move(fullSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { noMove, fullSpeed } }) => {
				assert.ok(fullSpeed.pos.isEqualTo(23, 4));
				assert.ok(noMove.pos.isEqualTo(24, 5));
				assert.strictEqual(noMove.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 2);
			});
		}));

		test('with fatigue', () => sim(async ({ player, poke, tick }) => {
			await poke('W0N0', '100', Game => {
				Game.creeps.halfSpeed.fatigue = 2;
			});
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(halfSpeed.move(fullSpeed), C.OK);
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.ok(fullSpeed.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 4);
			});
		}));

		test('cycle', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(halfSpeed.move(halfSpeed2), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2), C.OK);
				assert.strictEqual(halfSpeed2.move(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed2.pull(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				assert.ok(halfSpeed.pos.isEqualTo(25, 3));
				assert.ok(halfSpeed2.pos.isEqualTo(24, 4));
				assert.ok((halfSpeed.fatigue === 0) !== (halfSpeed2.fatigue === 0));
			});
		}));

		test('move chain', () => sim(async ({ player, tick }) => {
			await player('100', ({ creeps: { fullSpeed, halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(fullSpeed), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2), C.OK);
				assert.strictEqual(halfSpeed2.move(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2, fullSpeed } }) => {
				assert.ok(fullSpeed.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed.pos.isEqualTo(24, 5));
				assert.ok(halfSpeed2.pos.isEqualTo(24, 4));
				assert.strictEqual(fullSpeed.fatigue, 4);
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(halfSpeed2.fatigue, 0);
			});
		}));

		test('move chain w/ fatigue', () => sim(async ({ player, tick, poke }) => {
			await poke('W0N0', '100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				halfSpeed.fatigue = 2;
				halfSpeed2.fatigue = 2;
			});
			await player('100', ({ creeps: { fullSpeed, halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(fullSpeed), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2), C.OK);
				assert.strictEqual(halfSpeed2.move(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2, fullSpeed } }) => {
				assert.ok(fullSpeed.pos.isEqualTo(24, 6));
				assert.ok(halfSpeed.pos.isEqualTo(24, 5));
				assert.ok(halfSpeed2.pos.isEqualTo(24, 4));
				assert.strictEqual(fullSpeed.fatigue, 8);
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(halfSpeed2.fatigue, 0);
			});
		}));
	});
});
