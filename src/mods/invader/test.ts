import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { create as createCreep } from 'xxscreeps/mods/creep/creep.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

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
			Game.creeps.dummy.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7.find(C.FIND_HOSTILE_CREEPS);
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
			Game.creeps.dummy.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7.find(C.FIND_HOSTILE_CREEPS);
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
			Game.creeps.dummy.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7.find(C.FIND_HOSTILE_CREEPS);
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
			Game.creeps.dummy.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W1N1.find(C.FIND_HOSTILE_CREEPS);
			assert.ok(invaders.length > 0, 'invaders should spawn at exits to highway rooms');
			for (const invader of invaders) {
				assert.strictEqual(invader.pos.y, 49,
					`invader at (${invader.pos.x},${invader.pos.y}) should be on BOTTOM exit (y=49)`);
			}
		});
	}));

	test('invaders only at exits to uncontrolled rooms', () => partialBlock(async ({ player, tick }) => {
		await player('100', Game => {
			Game.creeps.dummy.move(C.TOP);
		});
		await tick();
		await player('100', Game => {
			const invaders = Game.rooms.W7N7.find(C.FIND_HOSTILE_CREEPS);
			assert.ok(invaders.length > 0, 'invaders should spawn at unblocked exits');
			for (const invader of invaders) {
				assert.strictEqual(invader.pos.x, 0,
					`invader at (${invader.pos.x},${invader.pos.y}) should be on LEFT exit (x=0)`);
			}
		});
	}));
});
