import C from 'xxscreeps/game/constants';
import { assert, describe, simulate, test } from 'xxscreeps/test';
import { RoomPosition } from 'xxscreeps/game/position';
import { create } from './creep';

describe('Movement', () => {
	const movement = simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0'), [ C.MOVE ], 'topLeft', '100'));
			room['#insertObject'](create(new RoomPosition(26, 25, 'W0N0'), [ C.MOVE ], 'topRight', '100'));
			room['#insertObject'](create(new RoomPosition(25, 26, 'W0N0'), [ C.MOVE ], 'bottomLeft', '100'));
			room['#insertObject'](create(new RoomPosition(26, 26, 'W0N0'), [ C.MOVE, C.MOVE ], 'bottomRight', '100'));
		},
	});

	test('following', () => movement(async({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.RIGHT);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert(Game.creeps.topRight.pos.isEqualTo(27, 25));
		});
	}));

	test('swapping', () => movement(async({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.bottomLeft.move(C.TOP);
			Game.creeps.bottomRight.move(C.LEFT);
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert(Game.creeps.topRight.pos.isEqualTo(25, 25));
			assert(Game.creeps.bottomLeft.pos.isEqualTo(25, 26));
			assert(Game.creeps.bottomRight.pos.isEqualTo(26, 26));
		});
	}));

	test('swapping second', () => movement(async({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.LEFT);
			Game.creeps.bottomLeft.move(C.TOP);
			Game.creeps.bottomRight.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert(Game.creeps.topRight.pos.isEqualTo(25, 25));
			assert(Game.creeps.bottomLeft.pos.isEqualTo(25, 26));
			assert(Game.creeps.bottomRight.pos.isEqualTo(26, 26));
		});
	}));

	test('swapping against fast', () => movement(async({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.bottomRight.move(C.TOP);
			Game.creeps.topLeft.move(C.RIGHT);
			Game.creeps.topRight.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.topLeft.pos.isEqualTo(26, 25));
			assert(Game.creeps.topRight.pos.isEqualTo(25, 25));
			assert(Game.creeps.bottomRight.pos.isEqualTo(26, 26));
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
			assert(Game.creeps.topLeft.pos.isEqualTo(24, 25, 'W0N0'));
			assert(Game.creeps.bottomLeft.pos.isEqualTo(25, 26, 'W0N0'));
		});
	}));
	*/

	const fastSlow = simulate({
		W0N0: room => {
			room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0'), [ C.MOVE, C.MOVE ], 'topLeft', '100'));
			room['#insertObject'](create(new RoomPosition(25, 26, 'W0N0'), [ C.MOVE ], 'bottomLeft', '100'));
		},
	});

	test('fast wins', () => fastSlow(async({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.bottomLeft.move(C.TOP_LEFT);
			Game.creeps.topLeft.move(C.LEFT);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.bottomLeft.pos.isEqualTo(25, 26));
			assert(Game.creeps.topLeft.pos.isEqualTo(24, 25));
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
	test('safe mode', () => hostile(async({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.creep.move(C.BOTTOM), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.creep.pos.isEqualTo(25, 26));
			assert.strictEqual(Game.creeps.creep.move(C.TOP), C.OK);
		});
		await player('101', Game => {
			assert.strictEqual(Game.creeps.creep.move(C.TOP), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.creep.pos.isEqualTo(25, 25));
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
	test('safe mode - friendly obstacle', () => enterSameTileOwnerObstacle(async({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
		});
		await player('101', Game => {
			assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.ownerObstacle.pos.isEqualTo(20, 21));
			assert(Game.creeps.owner.pos.isEqualTo(20, 20));
		});
		await player('101', Game => {
			assert(Game.creeps.hostile2.pos.isEqualTo(20, 22));
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
	test('safe mode - hostile obstacle', () => enterSameTileHostileObstacle(async({ player, tick }) => {
		await player('100', Game => {
			assert.strictEqual(Game.creeps.owner.move(C.BOTTOM), C.OK);
		});
		await player('101', Game => {
			assert.strictEqual(Game.creeps.hostile2.move(C.TOP), C.OK);
		});
		await tick();
		await player('100', Game => {
			assert(Game.creeps.owner.pos.isEqualTo(20, 21));
		});
		await player('101', Game => {
			assert(Game.creeps.hostileObstacle.pos.isEqualTo(20, 21));
			assert(Game.creeps.hostile2.pos.isEqualTo(20, 22));
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
	test('safe mode - hostile obstacle w/ follower', () => enterPossiblyFreeTile(async({ player, tick }) => {
		await player('100', Game => {
			// try to move into hostile position
			assert(Game.creeps.owner.pos.isEqualTo(20, 20));
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
			assert(Game.creeps.hostile.pos.isEqualTo(20, 21));
			assert(Game.creeps.hostile2.pos.isEqualTo(20, 22));
		});
		await player('100', Game => {
			// owner moved to hostile position
			assert(Game.creeps.owner.pos.isEqualTo(20, 21));
			assert(Game.creeps.ownerObstacle.pos.isEqualTo(19, 21));
		});
	}));

	test('safe mode - hostile conflict w/ follower', () => enterPossiblyFreeTile(async({ player, tick }) => {
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
			assert(Game.creeps.owner.pos.isEqualTo(21, 21));
		});
		await player('101', Game => {
			assert(Game.creeps.hostile.pos.isEqualTo(20, 21));
			assert(Game.creeps.hostile2.pos.isEqualTo(20, 22));
		});
	}));

	describe('Room', () => {
		const sim = simulate({
			W0N0: room => {
				room['#insertObject'](create(new RoomPosition(24, 5, 'W0N0'), [ C.MOVE, C.TOUGH, C.TOUGH ], 'slow', '100'));
			},
		});

		test('edge fatigue', () => sim(async({ player, tick }) => {
			await tick(11, {
				100: ({ creeps: { slow } }) => {
					slow.moveTo(new RoomPosition(24, 48, 'W0N1'));
				},
			});
			await player('100', ({ creeps: { slow } }) => {
				assert(slow.pos.isEqualTo(24, 48));
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

		test('direction syntax', () => sim(async({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(C.BOTTOM), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert(fullSpeed.pos.isEqualTo(24, 6));
				assert(halfSpeed.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 2);
			});
		}));

		test('creep', () => sim(async({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(fullSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert(fullSpeed.pos.isEqualTo(24, 6));
				assert(halfSpeed.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 2);
			});
		}));

		test('without follow', () => sim(async({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(C.TOP_LEFT), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, fullSpeed } }) => {
				assert(fullSpeed.pos.isEqualTo(24, 6));
				assert(halfSpeed.pos.isEqualTo(23, 3));
				assert.strictEqual(halfSpeed.fatigue, 2);
				assert.strictEqual(fullSpeed.fatigue, 0);
			});
		}));

		test('no move parts', () => sim(async({ player, tick }) => {
			await player('100', ({ creeps: { noMove, fullSpeed } }) => {
				assert.strictEqual(fullSpeed.move(C.TOP_LEFT), C.OK);
				assert.strictEqual(fullSpeed.pull(noMove), C.OK);
				assert.strictEqual(noMove.move(fullSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { noMove, fullSpeed } }) => {
				assert(fullSpeed.pos.isEqualTo(23, 4));
				assert(noMove.pos.isEqualTo(24, 5));
				assert.strictEqual(noMove.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 2);
			});
		}));

		test('with fatigue', () => sim(async({ player, poke, tick }) => {
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
				assert(fullSpeed.pos.isEqualTo(24, 6));
				assert(halfSpeed.pos.isEqualTo(24, 5));
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(fullSpeed.fatigue, 4);
			});
		}));

		test('cycle', () => sim(async({ player, tick }) => {
			await player('100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(halfSpeed.move(halfSpeed2), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2), C.OK);
				assert.strictEqual(halfSpeed2.move(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed2.pull(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2 } }) => {
				assert(halfSpeed.pos.isEqualTo(25, 3));
				assert(halfSpeed2.pos.isEqualTo(24, 4));
				assert((halfSpeed.fatigue === 0) !== (halfSpeed2.fatigue === 0));
			});
		}));

		test('move chain', () => sim(async({ player, tick }) => {
			await player('100', ({ creeps: { fullSpeed, halfSpeed, halfSpeed2 } }) => {
				assert.strictEqual(fullSpeed.move(C.BOTTOM), C.OK);
				assert.strictEqual(fullSpeed.pull(halfSpeed), C.OK);
				assert.strictEqual(halfSpeed.move(fullSpeed), C.OK);
				assert.strictEqual(halfSpeed.pull(halfSpeed2), C.OK);
				assert.strictEqual(halfSpeed2.move(halfSpeed), C.OK);
			});
			await tick();
			await player('100', ({ creeps: { halfSpeed, halfSpeed2, fullSpeed } }) => {
				assert(fullSpeed.pos.isEqualTo(24, 6));
				assert(halfSpeed.pos.isEqualTo(24, 5));
				assert(halfSpeed2.pos.isEqualTo(24, 4));
				assert.strictEqual(fullSpeed.fatigue, 4);
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(halfSpeed2.fatigue, 0);
			});
		}));

		test('move chain w/ fatigue', () => sim(async({ player, tick, poke }) => {
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
				assert(fullSpeed.pos.isEqualTo(24, 6));
				assert(halfSpeed.pos.isEqualTo(24, 5));
				assert(halfSpeed2.pos.isEqualTo(24, 4));
				assert.strictEqual(fullSpeed.fatigue, 8);
				assert.strictEqual(halfSpeed.fatigue, 0);
				assert.strictEqual(halfSpeed2.fatigue, 0);
			});
		}));
	});
});
