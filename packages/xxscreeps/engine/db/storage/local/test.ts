import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';

describe('LocalKeyValResponder', () => {
	test('zUnionStore applies WEIGHTS to single-set members', async () => {
		using testShard = await instantiateTestShard();
		const { scratch } = testShard.shard;
		await Promise.all([
			scratch.zAdd('a', [ [ 5, 'only-a' ] ]),
			scratch.zAdd('b', [ [ 7, 'only-b' ] ]),
		]);
		await scratch.zUnionStore('out', [ 'a', 'b' ], { weights: [ 2, 3 ] });
		assert.strictEqual(await scratch.zScore('out', 'only-a'), 10);
		assert.strictEqual(await scratch.zScore('out', 'only-b'), 21);
	});
});
