import type { Comparator } from 'xxscreeps/functional/comparator.js';
import { fold } from './fold.js';

/**
 * Returns the maximum item in an iterable based on a comparator.
 */
export function maximum<Type>(iterable: Iterable<Type>, comparator: Comparator<Type>): Type | undefined {
	return fold(iterable, undefined, (left, right) => comparator(left, right) > 0 ? left : right);
}
