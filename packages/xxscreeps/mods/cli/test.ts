import { inspect } from 'node:util';
import { Fn } from 'xxscreeps/functional/fn.js';
import { GameState, hooks, initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { evaluate } from './evaluate.js';
import 'xxscreeps/config/mods/import/game.js';

initializeGameEnvironment();
for (const hook of hooks.map('runtimeConnector')) {
	hook.initialize?.({} as never);
}

describe('cli', () => {
	test('xxscreeps cli -e runs the expression against committed shard state', async () => {
		using testShard = await instantiateTestShard();
		const { shard, world } = testShard;
		const roomNames = await shard.data.smembers('rooms');
		const rooms = await Promise.all(Fn.map(roomNames, name => shard.loadRoom(name)));
		const state = new GameState(world, shard.time, rooms);

		// Proof: globalThis-resident constant + a room.find that walks blob-overlay state.
		// W1N1 is seeded with two `E` tiles in test/data/shard.json.
		const sourceCount = await evaluate(state, "Game.rooms['W1N1'].find(FIND_SOURCES).length");
		assert.strictEqual(sourceCount, 2);

		// Inspect formatting matches the one-shot stdout exactly.
		const printed = await evaluate(state, "Object.keys(Game.rooms).filter(name => name === 'W1N1')");
		assert.strictEqual(inspect(printed), "[ 'W1N1' ]");
	});
});
