import assert from 'assert';
import * as C from 'xxscreeps/game/constants';
import { RoomPosition } from 'xxscreeps/game/position';
import { simulate } from 'xxscreeps/test';
import { create } from './creep';

const movement = simulate({
	W0N0: room => {
		room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0'), [ C.MOVE ], 'topLeft', '100'));
		room['#insertObject'](create(new RoomPosition(26, 25, 'W0N0'), [ C.MOVE ], 'topRight', '100'));
		room['#insertObject'](create(new RoomPosition(25, 26, 'W0N0'), [ C.MOVE ], 'bottomLeft', '100'));
		room['#insertObject'](create(new RoomPosition(26, 26, 'W0N0'), [ C.MOVE ], 'bottomRight', '100'));
	},
});

// Creep following another creep
await movement(async({ player, tick }) => {
	await player('100', Game => {
		Game.creeps.topLeft.move(C.RIGHT);
		Game.creeps.topRight.move(C.RIGHT);
	});
	await tick();
	await player('100', Game => {
		assert.ok(Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(26, 25, 'W0N0')));
		assert.ok(Game.creeps.topRight.pos.isEqualTo(new RoomPosition(27, 25, 'W0N0')));
	});
});

// Creeps swapping (variant 1)
await movement(async({ player, tick }) => {
	await player('100', Game => {
		Game.creeps.bottomLeft.move(C.TOP);
		Game.creeps.bottomRight.move(C.LEFT);
		Game.creeps.topLeft.move(C.RIGHT);
		Game.creeps.topRight.move(C.LEFT);
	});
	await tick();
	await player('100', Game => {
		assert.ok(Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(26, 25, 'W0N0')));
		assert.ok(Game.creeps.topRight.pos.isEqualTo(new RoomPosition(25, 25, 'W0N0')));
		assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, 'W0N0')));
		assert.ok(Game.creeps.bottomRight.pos.isEqualTo(new RoomPosition(26, 26, 'W0N0')));
	});
});

// Creeps swapping (variant 2)
await movement(async({ player, tick }) => {
	await player('100', Game => {
		Game.creeps.topLeft.move(C.RIGHT);
		Game.creeps.topRight.move(C.LEFT);
		Game.creeps.bottomLeft.move(C.TOP);
		Game.creeps.bottomRight.move(C.LEFT);
	});
	await tick();
	await player('100', Game => {
		assert.ok(Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(26, 25, 'W0N0')));
		assert.ok(Game.creeps.topRight.pos.isEqualTo(new RoomPosition(25, 25, 'W0N0')));
		assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, 'W0N0')));
		assert.ok(Game.creeps.bottomRight.pos.isEqualTo(new RoomPosition(26, 26, 'W0N0')));
	});
});

// Creep with follower wins
await movement(async({ player, tick }) => {
	await player('100', Game => {
		Game.creeps.bottomLeft.move(C.TOP_LEFT);
		Game.creeps.topLeft.move(C.LEFT);
		Game.creeps.topRight.move(C.LEFT);
	});
	await tick();
	await player('100', Game => {
		assert.ok(Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(24, 25, 'W0N0')));
		assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, 'W0N0')));
	});
});

const fastSlow = simulate({
	W0N0: room => {
		room['#insertObject'](create(new RoomPosition(25, 25, 'W0N0'), [ C.MOVE, C.MOVE ], 'topLeft', '100'));
		room['#insertObject'](create(new RoomPosition(25, 26, 'W0N0'), [ C.MOVE ], 'bottomLeft', '100'));
	},
});

// Fastest creep wins (TODO)
await fastSlow(async({ player, tick }) => {
	await player('100', Game => {
		Game.creeps.bottomLeft.move(C.TOP_LEFT);
		Game.creeps.topLeft.move(C.LEFT);
	});
	await tick();
	await player('100', Game => {
		assert.ok(Game.creeps.bottomLeft.pos.isEqualTo(new RoomPosition(25, 26, 'W0N0')));
		assert.ok(Game.creeps.topLeft.pos.isEqualTo(new RoomPosition(24, 25, 'W0N0')));
	});
});
