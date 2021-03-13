import lodash from 'lodash';
import * as C from './constants';
import * as Memory from './memory';
import { Flag } from './flag';
import { RoomPosition } from './position';
import { Room } from './room';
import { RoomVisual } from './visual';

import { Creep } from './objects/creep';

const runtimeGlobals: Record<string, any> = Object.create(null);
export function registerGlobal(name: string, value: any): void;
export function registerGlobal(fn: Function): void;
export function registerGlobal(...args: [ string, any ] | [ Function ]) {
	const { name, value } = args.length === 1 ?
		{ name: args[0].name, value: args[0] } :
		{ name: args[0], value: args[1] };
	runtimeGlobals[name] = value;
}

export function setupGlobals(globalThis: any) {

	// Global lodash compatibility
	globalThis._ = lodash;

	// Export constants
	for (const [ identifier, value ] of Object.entries(C)) {
		globalThis[identifier] = value;
	}

	// Memory
	globalThis.RawMemory = Memory.RawMemory;
	Object.defineProperty(globalThis, 'Memory', {
		enumerable: true,
		get: Memory.get,
		set: Memory.set,
	});

	// Not implemented
	globalThis.Mineral = function() {};
	globalThis.StructureLink = function() {};
	globalThis.StructureObserver = function() {};
	globalThis.StructureTerminal = function() {};
	globalThis.Tombstone = function() {};

	// Everything else
	for (const [ key, object ] of Object.entries({
		Creep,
		Flag,
		Room,
		RoomPosition,
		RoomVisual,
	})) {
		globalThis[key] = object;
	}
	for (const [ key, object ] of Object.entries(runtimeGlobals)) {
		globalThis[key] = object;
	}
}
