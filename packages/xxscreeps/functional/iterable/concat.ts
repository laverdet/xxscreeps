import { identity } from 'xxscreeps/functional/function/identity.js';
import { transform } from './transform.js';

/**
 * Iterate each item from an iterable of iterables.
 */
export function concat<Type>(iterators: Iterable<Iterable<Type>>): Iterable<Type> {
	return transform(iterators, identity);
}
