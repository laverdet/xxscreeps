import type { AsyncEffectAndResult } from './types.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import { acquireWith } from 'xxscreeps/utility/async.js';
import { lateCallback } from './memoize.js';

export function makeHookRegistration<Keys extends Record<string, unknown>>() {
	const hooksByName = new Map<keyof Keys, UnknownCallback[]>();
	const took = new Set<keyof Keys>();

	type UnknownCallback = (...args: unknown[]) => unknown;
	type Hook = {
		/**
		 * Makes an invocator which iterates through all hooks unconditionally.
		 */
		makeIterated: <Key extends keyof Keys>(key: Key) =>
			(() => void) extends Keys[Key]
				? Keys[Key] extends (...args: infer Args) => void
					? (...args: Args) => void
					: never
				: never;

		/**
		 * Makes an invocator which maps the hooks with arguments.
		 */
		makeMapped: <Key extends keyof Keys>(key: Key) =>
			Keys[Key] extends (...args: infer Params) => infer Result
				? (...args: Params) => Iterable<Result>
				: never;

		/**
		 * Makes an invocator which passes a value through each hooks and returns the final result.
		 */
		makeReduced: <Key extends keyof Keys>(key: Key) =>
				Keys[Key] extends (arg: infer Type) => infer Type
					? (arg: Type) => Type
					: never;

		/**
		 * Iterates over each hook.
		 */
		map:
			(<Key extends keyof Keys>(key: Key) => Iterable<Keys[Key]>) &
			(<Key extends keyof Keys, Type>(key: Key, fn: (value: Keys[Key]) => Type) => Iterable<Type>);

		/**
		 * Register a hook
		 */
		register: <Key extends keyof Keys>(key: Key, handler: Keys[Key]) => void;
	};

	const hookable: Hook = {
		makeIterated(key): any {
			return lateCallback(() => {
				took.add(key);
				const handlers = [ ...hooksByName.get(key) ?? [] ];
				return Fn.fold(handlers, () => {}, (prev, next) => Fn.chainSequenceVoidN(prev, next));
			});
		},

		makeMapped(key): any {
			return lateCallback(() => {
				took.add(key);
				const handlers = [ ...hooksByName.get(key) ?? [] ];
				return (...args: unknown[]) => Fn.map(handlers, fn => fn(...args));
			});
		},

		makeReduced(key): any {
			return lateCallback(() => {
				const handlers = [ ...hooksByName.get(key) ?? [] ];
				took.add(key);
				return Fn.fold(handlers, (value: unknown) => value, (prev, next) => Fn.chainSequenceInto(prev, next));
			});
		},

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		map(key: keyof Keys, fn = (value: any) => value): any {
			return Fn.map(hooksByName.get(key) ?? [], fn);
		},

		register(key, handler) {
			if (took.has(key)) {
				throw new Error(`Already took ${String(key)}`);
			}
			const handlers = hooksByName.get(key);
			if (handlers) {
				handlers.push(handler as UnknownCallback);
			} else {
				hooksByName.set(key, [ handler as UnknownCallback ]);
			}
		},
	};

	return hookable;
}

export async function acquireHookEffects<Type>(disposable: DisposableStack, hooks: Iterable<AsyncEffectAndResult<Type | undefined>>) {
	return Fn.pipe(
		await acquireWith(
			value => {
				if (value) {
					const [ effect ] = value;
					if (effect) {
						disposable.defer(effect);
					}
				}
			},
			...Fn.map(hooks, hook => Promise.resolve(hook)),
		),
		$$ => Fn.map($$, result => result?.[1]),
		$$ => Fn.filter($$, nonNullPredicate),
		$$ => [ ...$$ ]);
}
