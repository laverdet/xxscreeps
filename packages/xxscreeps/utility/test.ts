import * as assert from 'node:assert';
import { numericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { deterministicRandomForTesting } from 'xxscreeps/test/fixtures.js';
import { describe, test } from 'xxscreeps/test/index.js';
import { shuffle, shuffledRange, shuffledSquare } from './random.js';

describe('utility', () => {
	describe('random', () => {
		test('shuffledRange yields each index exactly once', () => {
			using rng = deterministicRandomForTesting();
			for (const count of [ 0, 1, 2, 3, 4, 15, 16, 17, 100, 1000 ]) {
				assert.deepStrictEqual([ ...shuffledRange(count) ].sort(numericComparator), [ ...Fn.range(count) ]);
			}
		});

		test('shuffledSquare visits every position exactly once', () => {
			using rng = deterministicRandomForTesting();
			const visited = Fn.pipe(
				shuffledSquare(5, 40),
				$$ => Fn.map($$, ([ xx, yy ]) => yy * 50 + xx),
				$$ => [ ...$$ ]);
			assert.strictEqual(visited.length, 1600);
			assert.strictEqual(new Set(visited).size, 1600);
			assert.ok(Fn.every(shuffledSquare(5, 40), ([ xx, yy ]) => xx >= 5 && xx < 45 && yy >= 5 && yy < 45));
		});

		test('shuffle yields each element exactly once', () => {
			using rng = deterministicRandomForTesting();
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
			using rng = deterministicRandomForTesting();
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
