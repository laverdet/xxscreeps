import lodash from '@xxscreeps/lodash3';
import * as C from './constants/index.js';
import { hooks, registerGlobal } from './symbols.js';

declare global {
	function enumerable(target: object, key: string, descriptor: PropertyDescriptor): void;
}

globalThis.enumerable = (target: object, key: string, descriptor: PropertyDescriptor) => ({ ...descriptor, enumerable: true });

registerGlobal('_', lodash);

registerGlobal(function Deposit() {});
registerGlobal(function PowerCreep() {});
registerGlobal(function StructurePowerBank() {});
registerGlobal(function StructurePowerSpawn() {});

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
	delete globalThis.enumerable;
}
