import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as Path from 'node:path';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { stagingPath, writeAtomic } from './atomic.js';
import { LocalKeyValResponder } from './keyval.js';

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

	// A shared staging name lets two writers of the same key interleave into one `.swp`, and the
	// rename then installs whatever mixture happens to be on disk.
	test('every write stages into its own file', () => {
		const target = Path.join('dir', 'data.json');
		const first = stagingPath(target);
		const second = stagingPath(target);
		assert.notStrictEqual(first, second);
		assert.strictEqual(Path.dirname(first), Path.dirname(target));
		assert.ok(Path.basename(first).endsWith('.swp'));
	});

	test('a staged write that fails verification does not replace the target', async () => {
		const dir = await fs.mkdtemp(Path.join(os.tmpdir(), 'xxscreeps-atomic-'));
		try {
			const target = Path.join(dir, 'value');
			await fs.writeFile(target, 'previous');
			await assert.rejects(
				writeAtomic(target, 'damaged', () => {
					throw new Error('read-back mismatch');
				}),
				/read-back mismatch/,
			);
			// The previous value survives, and the staging file is not left behind.
			assert.strictEqual(await fs.readFile(target, 'utf8'), 'previous');
			assert.deepStrictEqual(
				(await fs.readdir(dir)).filter(name => name.endsWith('.swp')),
				[],
			);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('verification reads the staged bytes before the rename', async () => {
		const dir = await fs.mkdtemp(Path.join(os.tmpdir(), 'xxscreeps-atomic-'));
		try {
			const target = Path.join(dir, 'value');
			let observed: string | undefined;
			await writeAtomic(target, 'payload', copy => {
				observed = copy as string;
			});
			assert.strictEqual(observed, 'payload');
			assert.strictEqual(await fs.readFile(target, 'utf8'), 'payload');
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	test('an unreadable snapshot names the file it could not parse', async () => {
		const dir = await fs.mkdtemp(Path.join(os.tmpdir(), 'xxscreeps-snapshot-'));
		try {
			await fs.writeFile(Path.join(dir, 'data.json'), '{"#":"map","$":{');
			const url = new URL(`file://${dir}`);
			await assert.rejects(
				LocalKeyValResponder.create(url),
				err => err instanceof Error && err.message.includes(`${dir}/data.json`),
			);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
});
