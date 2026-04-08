import type { Nullable } from 'xxscreeps/functional/types.js';

type AnyFn = (...args: any[]) => any;
type Combinator<Prev extends AnyFn, Next extends AnyFn> =
	(prev: Prev, next: Next) => (...args: Parameters<Prev & Next>) => ReturnType<Prev & Next>;

/**
 * Utility which can be used as a reducer against an iterable of nullable functions.
 *
 * You're better off using the `fold` technique like `compositeComparator` for iterables which do
 * not contain nullable functions. Otherwise this is handy.
 */
export function chain<Prev extends AnyFn, Next extends AnyFn>(prev: Nullable<Prev>, next: Next, combine: Combinator<Prev, Next>): Prev | Next;
export function chain<Prev extends AnyFn, Next extends AnyFn>(prev: Prev, next: Nullable<Next>, combine: Combinator<Prev, Next>): Prev | Next;
export function chain<Prev extends AnyFn, Next extends AnyFn>(prev: Prev | null, next: Next | null, combine: Combinator<Prev, Next>): Prev | Next | null;
export function chain<Prev extends AnyFn, Next extends AnyFn>(prev: Prev | undefined, next: Next | undefined, combine: Combinator<Prev, Next>): Prev | Next | undefined;
export function chain<Prev extends AnyFn, Next extends AnyFn>(prev: Nullable<Prev>, next: Nullable<Next>, combine: Combinator<Prev, Next>): Nullable<Prev | Next>;

export function chain(
	prev: Nullable<AnyFn>,
	next: Nullable<AnyFn>,
	combine: Combinator<AnyFn, AnyFn>,
): Nullable<AnyFn> {
	return prev
		? next
			? combine(prev, next)
			: prev
		: next;
}

export function chainSequenceInto<Arg>(prev: (arg: Arg) => Arg, next: (arg: Arg) => Arg) {
	return (arg: Arg) => next(prev(arg));
}

export function chainSequenceVoid0(prev: () => void, next: () => void) {
	return (): void => {
		next();
		prev();
	};
}

export function chainSequenceVoid1<Arg>(prev: (arg: Arg) => void, next: (arg: Arg) => void) {
	return (arg: Arg): void => {
		next(arg);
		prev(arg);
	};
}
