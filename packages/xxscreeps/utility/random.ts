import { Fn } from 'xxscreeps/functional/fn.js';
import { hashCombine } from './utility.js';

/**
 * Yields every integer in `[0, count)` exactly once, in a pseudo-random order drawn from
 * `Math.random()` at the time of the call. The order comes from a feistel permutation over the
 * smallest enclosing power-of-4 domain, cycle-walking values that land outside `[0, count)`, so no
 * backing array is allocated. The int32 half-swap bounds `count` at 2^30.
 */
export function shuffledRange(count: number): Iterable<number> {
	const halfBits = Math.ceil(Math.log2(Math.max(2, count)) / 2);
	const mask = (1 << halfBits) - 1;
	const keys = [ ...Fn.map(Fn.range(4), () => Math.floor(Math.random() * 0x100000000)) ];
	const permute = (index: number) => {
		let left = index >>> halfBits;
		let right = index & mask;
		for (const key of keys) {
			[ left, right ] = [ right, left ^ (hashCombine(right, key) & mask) ];
		}
		return (left << halfBits) | right;
	};
	const walk = (value: number): number => value < count ? value : walk(permute(value));
	return Fn.map(Fn.range(count), index => walk(permute(index)));
}

/**
 * Yields every element of `list` exactly once, in pseudo-random order, without mutating the list.
 */
export function shuffle<Type>(list: readonly Type[]): Iterable<Type> {
	return Fn.map(shuffledRange(list.length), index => list[index]!);
}

/**
 * Yields every (xx, yy) pair with both coordinates in `[min, min + span)` exactly once, in
 * pseudo-random order.
 */
export function shuffledSquare(min: number, span: number): Iterable<readonly [ number, number ]> {
	return Fn.map(shuffledRange(span * span), index => [ min + index % span, min + Math.floor(index / span) ] as const);
}
