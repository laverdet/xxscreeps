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
