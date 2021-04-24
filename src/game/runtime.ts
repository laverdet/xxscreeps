import type { GameConstructor } from '.';
import lodash from 'lodash';
import { globals } from './symbols';
import * as C from './constants';
import * as Memory from './memory';

export function setupGlobals(globalThis: any) {

	// Global lodash compatibility
	globalThis._ = lodash;

	// Exported globals, `registerGlobal`
	for (const [ key, object ] of Object.entries(globals)) {
		globalThis[key] = object;
	}

	// Export constants
	for (const [ identifier, value ] of Object.entries(C)) {
		globalThis[identifier] = value;
	}

	// Memory
	Object.defineProperty(globalThis, 'Memory', {
		enumerable: true,
		get: Memory.get,
		set: Memory.set,
	});

	// Not implemented
	globalThis.StructureLink = function() {};
	globalThis.StructureObserver = function() {};
	globalThis.StructureTerminal = function() {};
	globalThis.Tombstone = function() {};
}

// Used to extract type information from bundled dts file, via make-types.ts
export interface Global {
	Game: GameConstructor;
	Memory: any;
	console: Console;
}
export function globalNames() {
	return [ 'Game', 'Memory', 'console', ...Object.keys(globals) ];
}
export function globalTypes(): Global {
	return undefined as never;
}
