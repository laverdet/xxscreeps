import type ivm from 'isolated-vm';
import type { InitializationPayload } from 'xxscreeps/driver';
import * as Runtime from 'xxscreeps/driver/runtime';
export { tick } from 'xxscreeps/driver/runtime';

function freezeClass(constructor: abstract new(...args: any[]) => any) {
	freezeProperty(constructor, 'prototype');
	for (
		let prototype = constructor.prototype;
		prototype !== null && prototype !== Object.prototype;
		prototype = Object.getPrototypeOf(prototype)
	) {
		Object.freeze(prototype);
	}
}

function freezeProperty(object: {}, key: keyof any) {
	const info = Object.getOwnPropertyDescriptor(object, key)!;
	info.configurable = false;
	info.writable = false;
	Object.defineProperty(object, key, info);
}

// `iterator` can be used to override the behavior of the spread operator
freezeProperty(Array.prototype, Symbol.iterator);

// These all need to be locked down to prevent write access to shared terrain state
const typedArrays = [
	'ArrayBuffer',
	'SharedArrayBuffer',
	'Uint8Array',
	'Uint16Array',
	'Uint32Array',
	'Int8Array',
	'Int16Array',
	'Int32Array',
	'Float64Array',
] as const;
for (const key of typedArrays) {
	freezeProperty(globalThis, key);
	freezeClass(globalThis[key]);
}

export function initialize(
	isolate: ivm.Isolate,
	context: ivm.Context,
	printRef: ivm.Reference<Runtime.Print>,
	data: InitializationPayload,
) {
	const evaluate: Runtime.Evaluate = (source, filename) => {
		const script = isolate.compileScriptSync(source, { filename });
		return script.runSync(context, { reference: true }).deref();
	};
	const print: Runtime.Print = (fd, payload) => printRef.applySync(undefined, [ fd, payload ]);
	Runtime.initialize(evaluate, print, data);
}
