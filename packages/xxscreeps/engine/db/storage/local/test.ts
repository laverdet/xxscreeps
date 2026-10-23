import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { LocalKeyValResponder } from 'xxscreeps/engine/db/storage/local/keyval.js';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';

describe('engine/db/storage/local', () => {
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

	test('index ranges and ranks count from the high-score end under REV', async () => {
		await using testShard = await instantiateTestShard();
		const { scratch } = testShard.shard;
		await scratch.zAdd('ranked', [ [ 1, 'low' ], [ 3, 'high' ], [ 2, 'mid' ] ]);
		assert.deepStrictEqual(await scratch.zRange('ranked', 0, 1), [ 'low', 'mid' ]);
		assert.deepStrictEqual(await scratch.zRange('ranked', 0, 1, { rev: true }), [ 'high', 'mid' ]);
		assert.deepStrictEqual(
			await scratch.zRangeWithScores('ranked', 1, 2, { rev: true }),
			[ [ 2, 'mid' ], [ 1, 'low' ] ]);
		assert.strictEqual(await scratch.zRank('ranked', 'high'), 2);
		assert.strictEqual(await scratch.zRank('ranked', 'high', { rev: true }), 0);
		assert.strictEqual(await scratch.zRank('ranked', 'absent'), null);
		assert.strictEqual(await scratch.zRank('missing-key', 'high'), null);
	});

	test('a score range whose bounds contradict REV is rejected', async () => {
		await using testShard = await instantiateTestShard();
		const { scratch } = testShard.shard;
		await scratch.zAdd('ranked', [ [ 1, 'low' ], [ 3, 'high' ] ]);
		// Redis answers these with an empty range, so accepting them here would hide the divergence
		await assert.rejects(async () => scratch.zRange('ranked', 0, Infinity, { by: 'SCORE', rev: true }));
		await assert.rejects(async () => scratch.zRangeWithScores('ranked', 0, Infinity, { by: 'SCORE', rev: true }));
		await assert.rejects(async () => scratch.zRange('ranked', Infinity, 0, { by: 'SCORE' }));
		// Bounds given the way redis wants them, and a degenerate range, are fine either way
		assert.deepStrictEqual(await scratch.zRange('ranked', Infinity, 0, { by: 'SCORE', rev: true }), [ 'high', 'low' ]);
		assert.deepStrictEqual(await scratch.zRange('ranked', 3, 3, { by: 'SCORE', rev: true }), [ 'high' ]);
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

	test('an entry with an unknown tag is dropped and reported', async () => {
		const directory = await fs.mkdtemp(`${os.tmpdir()}/keyval-unknown-`);
		try {
			await fs.writeFile(`${directory}/data.json`, JSON.stringify({
				'#': 'map',
				$: {
					good: 'value',
					weird: { '#': 'nonsense', $: 1 },
				},
			}));
			const errors = new Array<string>();
			const error = console.error;
			console.error = (message: unknown) => void errors.push(String(message));
			try {
				await using responder = await LocalKeyValResponder.create(new URL(`file://${directory}`));
				// The known entry loads; the unknown one must not stop the store.
				assert.strictEqual(responder.get('good'), 'value');
				assert.strictEqual(responder.get('weird'), null);
			} finally {
				console.error = error;
			}
			// And it must not vanish silently.
			assert.ok(errors.some(message => message.includes('unknown tag')),
				`expected a report of the dropped entry, got: ${errors.join(' | ')}`);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
