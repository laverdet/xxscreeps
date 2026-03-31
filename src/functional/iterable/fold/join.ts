import { fold } from './fold.js';

/**
 * Eagerly iterates the iterable, joining the results with the given separator.
 */
export function join(iterable: Iterable<string>, separator = ''): string {
	return fold(iterable, '', (left, right) => `${left}${separator}${right}`);
}
