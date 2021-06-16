import * as Fn from './functional';

export function makeHookRegistration<keys extends Record<string, any>>() {
	const hooksByName = new Map<keyof any, any[]>();

	type Hook = {
		/**
		 * Makes an invocator which iterates through all hooks unconditionally.
		 */
		makeIterated<Key extends keyof keys>(key: Key):
		(() => void) extends keys[Key] ? keys[Key] extends (...args: infer Args) => void ?
			(...args: Args) => void : never : never;

		/**
		 * Makes an invocator which maps the hooks with arguments.
		 */
		makeMapped<Key extends keyof keys>(key: Key):
		keys[Key] extends (...args: infer Params) => infer Result ?
			(...args: Params) => Iterable<Result> : never;

		/**
		 * Makes an invocator which passes a value through each hooks and returns the final result.
		 */
		makeReduced<Key extends keyof keys>(key: Key):
		keys[Key] extends (arg: infer Type) => infer Type ?
			(arg: Type) => Type : never;

		/**
		 * Iterates over each hook.
		 */
		map<Key extends keyof keys>(key: Key): Iterable<keys[Key]>;
		map<Key extends keyof keys, Type>(key: Key, fn: (value: keys[Key]) => Type): Iterable<Type>;

		/**
		 * Register a hook
		 **/
		register<Key extends keyof keys>(key: Key, handler: keys[Key]): void;
	};

	const hookable: Hook = {
		makeIterated(key) {
			const handlers = hooksByName.get(key);
			if (handlers) {
				const { head, rest } = Fn.shift(handlers);
				let fn = head;
				for (const next of rest) {
					const prev = fn;
					fn = (...args: any[]) => {
						prev(...args);
						next(...args);
					};
				}
				return fn as never;
			} else {
				return (() => {}) as never;
			}
		},

		makeMapped(key): any {
			const handlers = hooksByName.get(key);
			if (handlers) {
				const savedHandlers = [ ...handlers ];
				return (...args: any[]) => Fn.map(savedHandlers, fn => fn(...args));
			} else {
				return function *() {};
			}
		},

		makeReduced(key) {
			const handlers = hooksByName.get(key);
			if (handlers) {
				const { head, rest } = Fn.shift(handlers);
				let fn = head;
				for (const next of rest) {
					const prev = fn;
					fn = (value: any) => next(prev(value));
				}
				return fn as never;
			} else {
				return ((value: any) => value) as never;
			}
		},

		map(key: keyof any, fn = (value: any) => value) {
			const handlers = hooksByName.get(key) ?? [];
			return Fn.map(handlers, fn);
		},

		register(key, handler) {
			const handlers = hooksByName.get(key);
			if (handlers) {
				handlers.push(handler);
			} else {
				hooksByName.set(key, [ handler ]);
			}
		},
	};

	return hookable;
}
