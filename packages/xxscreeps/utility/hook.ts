import type { AsyncEffectAndResult } from './types.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import { acquireWith } from 'xxscreeps/utility/async.js';
import { lateCallback } from './memoize.js';

export interface ProviderRegistration<Type extends object> {
	/**
	 * Replace the default implementation with `provider`. Throws if a provider was already registered,
	 * so two mods fighting over the same domain fail loudly instead of one silently shadowing the
	 * other.
	 */
	register: (provider: Type) => void;
	/** The active implementation: the registered override if any, otherwise the default. */
	readonly current: Type;
}

/**
 * A single-implementation override hook. Unlike `makeHookRegistration` (which fans out to *every*
 * registered handler), this resolves to exactly one implementation: a built-in `fallback` that at
 * most one mod may replace wholesale via `register`.
 *
 * Use this when a mod owns a piece of functionality — e.g. how a domain persists its data — that
 * another mod may want to swap out entirely (a SQL/document store instead of the default), as
 * opposed to extending or observing. `name` is only used in the conflict error message.
 */
export function makeProviderRegistration<Type extends object>(name: string, fallback: Type): ProviderRegistration<Type> {
	let override: Type | undefined;
	return {
		register(provider) {
			if (override !== undefined) {
				throw new Error(`Provider '${name}' is already registered`);
			}
			override = provider;
		},
		get current() {
			return override ?? fallback;
		},
	};
}

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
