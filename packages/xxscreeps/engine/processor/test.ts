import { acquireNamedIntentsForTick, publishRunnerNamedIntents } from 'xxscreeps/engine/processor/model.js';
import { IntentManager } from 'xxscreeps/game/intents.js';
import { assert, describe, simulate, test } from 'xxscreeps/test/index.js';

// A named intent registers only a type — it carries no room, so it has no room processor. This
// sample exercises `pushNamed` without depending on a mod's real named intents.
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent {
		namedIntentTest: { type: 'namedTest'; intent: 'sample'; data: [ payload: { type: string } ] };
	}
}

describe('named intents', () => {
	test('pushNamed accumulates arg-tuples by receiver and intent', () => {
		const intents = new IntentManager();
		intents.pushNamed('namedTest', 'sample', { type: 'sell' });
		intents.pushNamed('namedTest', 'sample', { type: 'buy' });
		assert.deepStrictEqual(intents.getNamedIntents(), {
			namedTest: {
				sample: [
					[ { type: 'sell' } ],
					[ { type: 'buy' } ],
				],
			},
		});
	});

	test('publish round-trips through scratch into the per-tick drain', () => simulate({})(async ({ shard }) => {
		const named = { namedTest: { sample: [ [ { type: 'sell' } ] ] } };
		await publishRunnerNamedIntents(shard, '100', shard.time, named);
		assert.deepStrictEqual(
			await acquireNamedIntentsForTick(shard, shard.time),
			[ { userId: '100', named } ]);
	}));
});
