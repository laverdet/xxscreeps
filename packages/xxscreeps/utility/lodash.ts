import type { UnknownObject } from 'xxscreeps/utility/types.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { everyPredicate } from 'xxscreeps/functional/predicate.js';

/** @deprecated */
export type Iteratee<Type = unknown> = string | object | ((value: Type) => unknown);

function matches(source: object): (value: unknown) => boolean {
	return Fn.pipe(
		Object.entries(source),
		$$ => Fn.map($$, ([ key, expected ]: [ string, unknown ]) => {
			const test = function(): (actual: unknown) => boolean {
				if (typeof expected === 'object' && expected !== null) {
					const inner = matches(expected);
					return actual => typeof actual === 'object' && actual !== null && inner(actual);
				} else {
					return actual => actual === expected || Object.is(actual, expected);
				}
			}();
			return (value: unknown) => test((value as UnknownObject | null | undefined)?.[key]);
		}),
		$$ => everyPredicate($$));
}

/** @deprecated */
export function iteratee<Type>(shorthand: Iteratee<Type> | null | undefined): (value: Type) => unknown {
	if (typeof shorthand === 'function') {
		return shorthand as (value: Type) => unknown;
	} else if (typeof shorthand === 'string') {
		return Fn.pipe(
			shorthand.split(/[.[\]]+/),
			$$ => Fn.map($$, key => (object: unknown) => (object as UnknownObject | null | undefined)?.[key]),
			$$ => Fn.fold($$, null as never, Fn.chainSequenceInto));
	} else if (shorthand == null) {
		return Fn.identity;
	} else {
		return matches(shorthand);
	}
}

/** @deprecated */
export function filter<Type>(collection: readonly Type[], shorthand?: Iteratee<Type> | null): Type[] {
	return collection.filter(iteratee(shorthand));
}
