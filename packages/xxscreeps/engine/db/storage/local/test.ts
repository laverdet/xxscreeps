import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';

describe('LocalKeyValResponder', () => {
	test('zUnionStore applies WEIGHTS to single-set members', async () => {
		await using testShard = await instantiateTestShard();
		const { scratch } = testShard.shard;
		await Promise.all([
			scratch.zAdd('a', [ [ 5, 'only-a' ] ]),
			scratch.zAdd('b', [ [ 7, 'only-b' ] ]),
		]);
		await scratch.zUnionStore('out', [ 'a', 'b' ], { weights: [ 2, 3 ] });
		assert.strictEqual(await scratch.zScore('out', 'only-a'), 10);
		assert.strictEqual(await scratch.zScore('out', 'only-b'), 21);
	});

	test('blob set honors compare-and-swap conditions', async () => {
		await using testShard = await instantiateTestShard();
		const { data } = testShard.shard;
		const key = 'test/cas';
		const first = Uint8Array.from([ 1, 2, 3 ]);
		const second = Uint8Array.from([ 4, 5, 6 ]);
		// NX writes only when the key is absent.
		assert.strictEqual(await data.set(key, first, { if: { if: 'NX' } }), undefined);
		assert.strictEqual(await data.set(key, second, { if: { if: 'NX' } }), false);
		// EQ swaps only when the stored bytes match the expected prior.
		assert.strictEqual(await data.set(key, second, { if: { if: 'EQ', value: first } }), undefined);
		assert.deepStrictEqual([ ...(await data.get(key, { blob: true }))! ], [ 4, 5, 6 ]);
		// A now-stale prior no longer matches, so the swap is refused.
		assert.strictEqual(await data.set(key, first, { if: { if: 'EQ', value: first } }), false);
	});
});
