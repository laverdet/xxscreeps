import lodash from '@xxscreeps/lodash3';
import * as C from './constants/index.js';
import { hooks, registerGlobal } from './symbols.js';

const { apply } = Reflect;

declare global {
	function cached(target: object, key: string, descriptor: PropertyDescriptor): void;
	function enumerable(target: object, key: string, descriptor: PropertyDescriptor): void;
}

globalThis.cached = (target: object, key: string, descriptor: PropertyDescriptor) => {
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const { get } = descriptor;
	if (!get) {
		throw new TypeError('cached decorator can only be applied to getters');
	}
	const set = function(this: unknown, value: unknown) {
		Object.defineProperty(this, key, { value, writable: true });
	};
	return {
		set,
		...descriptor,
		get() {
			const value: unknown = apply(get, this, []);
			apply(set, this, [ value ]);
			return value;
		},
	};
};
globalThis.enumerable = (target: object, key: string, descriptor: PropertyDescriptor) => ({ ...descriptor, enumerable: true });

registerGlobal('_', lodash);

registerGlobal(function Deposit() {});

hooks.register('runtimeConnector', {
	initialize() {
		for (const [ identifier, value ] of Object.entries(C)) {
			// @ts-expect-error
			globalThis[identifier] = value;
		}
	},
});

export function flushGlobals() {
	// @ts-expect-error
	delete globalThis.cached;
	// @ts-expect-error
	delete globalThis.enumerable;
}
