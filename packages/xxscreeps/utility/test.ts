import * as assert from 'node:assert';
import { numericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { deterministicRandom, shuffle, shuffledRange, shuffledSquare } from './random.js';

describe('utility', () => {
	describe('random', () => {
		test('deterministicRandom replays its stream and restores Math.random', () => {
			const { random } = Math;
			const draw = (seed: number) => {
				using rng = deterministicRandom(seed);
				return [ ...Fn.map(Fn.range(1000), () => Math.random()) ];
			};
			// Zero is the interesting seed: `hashMix` fixes it, so a stream chaining the hash into its
			// own state returns zero forever from there.
			const first = draw(0);
			assert.deepStrictEqual(draw(0), first, 'the same seed replays');
			assert.notDeepStrictEqual(draw(1), first, 'a different seed diverges');
			assert.notStrictEqual(draw(1)[0], first[1], 'an adjacent seed is not the same stream shifted');
			assert.ok(first.every(value => value >= 0 && value < 1), 'every draw lands in [0, 1)');
			assert.strictEqual(new Set(first).size, first.length, 'no draw repeats');
			assert.strictEqual(Math.random, random, 'the original is restored');
		});

		test('shuffledRange yields each index exactly once', () => {
			using rng = deterministicRandom();
			for (const count of [ 0, 1, 2, 3, 4, 15, 16, 17, 100, 1000 ]) {
				assert.deepStrictEqual([ ...shuffledRange(count) ].sort(numericComparator), [ ...Fn.range(count) ]);
			}
		});

		test('shuffledSquare visits every position exactly once', () => {
			using rng = deterministicRandom();
			const visited = Fn.pipe(
				shuffledSquare(5, 40),
				$$ => Fn.map($$, ([ xx, yy ]) => yy * 50 + xx),
				$$ => [ ...$$ ]);
			assert.strictEqual(visited.length, 1600);
			assert.strictEqual(new Set(visited).size, 1600);
			assert.ok(Fn.every(shuffledSquare(5, 40), ([ xx, yy ]) => xx >= 5 && xx < 45 && yy >= 5 && yy < 45));
		});

		test('shuffle yields each element exactly once', () => {
			using rng = deterministicRandom();
			const list = [ ...Fn.range(26) ];
			assert.deepStrictEqual([ ...shuffle(list) ].sort(numericComparator), list);
		});

		test('a seeded order is drawn from the seed alone', () => {
			const seeded = function() {
				using rng = deterministicRandomForTesting(1);
				return [ ...shuffledRange(50, 0xbeef) ];
			}();
			using rng = deterministicRandomForTesting(2);
			assert.deepStrictEqual([ ...shuffledRange(50, 0xbeef) ], seeded);
			assert.notDeepStrictEqual([ ...shuffledRange(50, 0xf00d) ], seeded);
			assert.notDeepStrictEqual([ ...shuffledRange(50) ], seeded);
		});

		test('a seeded order is still a permutation', () => {
			for (const count of [ 0, 1, 2, 3, 4, 15, 16, 17, 100, 1000 ]) {
				assert.deepStrictEqual([ ...shuffledRange(count, count) ].sort(numericComparator), [ ...Fn.range(count) ]);
			}
		});

		test('seeded shuffle deals the same hand for the same seed', () => {
			const list = [ ...Fn.map(Fn.range(17), index => `card${index}`) ];
			assert.deepStrictEqual([ ...shuffle(list, 7) ], [ ...shuffle(list, 7) ]);
			assert.notDeepStrictEqual([ ...shuffle(list, 7) ], [ ...shuffle(list, 8) ]);
		});

		test('first yielded index is roughly uniform', () => {
			using rng = deterministicRandom();
			const trials = 10000;
			const counts = [ ...Fn.map(Fn.range(10), () => 0) ];
			for (let ii = 0; ii < trials; ++ii) {
				++counts[Fn.first(shuffledRange(10))!]!;
			}
			// Expected 1000 per bin; a bin outside ±30% signals a badly biased permutation, not noise.
			assert.ok(counts.every(count => count > 700 && count < 1300), `biased: ${counts.join()}`);
		});
	});
});
