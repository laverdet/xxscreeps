import type { KeysOf, KeyFor } from 'xxscreeps/util/types';
import * as C from 'xxscreeps/game/constants';
import { lookFor, Room } from './room';

// Registers a FIND_ constant and its respective handler
type FindHandler = (room: Room) => any[];
type FindHandlers = Exclude<Find[keyof Find], void>;
export type FindConstants = KeysOf<FindHandlers>;
export const findHandlers = new Map<number, FindHandler>();
export function registerFindHandlers<Find extends { [find: number]: FindHandler }>(handlers: Find): void | Find {
	for (const key in handlers) {
		findHandlers.set(Number(key), handlers[key]);
	}
}

// Built-in FIND_ handlers
const builtinFind = registerFindHandlers({
	// Construction sites
	[C.FIND_CONSTRUCTION_SITES]: room => lookFor(room, C.LOOK_CONSTRUCTION_SITES),
	[C.FIND_MY_CONSTRUCTION_SITES]: room =>
		lookFor(room, C.LOOK_CONSTRUCTION_SITES).filter(constructionSite => constructionSite.my),
	[C.FIND_HOSTILE_CONSTRUCTION_SITES]: room =>
		lookFor(room, C.LOOK_CONSTRUCTION_SITES).filter(constructionSite => !constructionSite.my),

	// Creeps
	[C.FIND_CREEPS]: room => lookFor(room, C.LOOK_CREEPS),
	[C.FIND_MY_CREEPS]: room => lookFor(room, C.LOOK_CREEPS).filter(creep => creep.my),
	[C.FIND_HOSTILE_CREEPS]: room => lookFor(room, C.LOOK_CREEPS).filter(creep => creep.my),

	// Spawns
	[C.FIND_MY_SPAWNS]: room => lookFor(room, C.LOOK_STRUCTURES).filter(
		structure => structure.structureType === 'spawn' && structure.my),
	[C.FIND_HOSTILE_SPAWNS]: room => lookFor(room, C.LOOK_STRUCTURES).filter(
		structure => structure.structureType === 'spawn' && structure.my === false),

	// Structures
	[C.FIND_STRUCTURES]: room => lookFor(room, C.LOOK_STRUCTURES),
	[C.FIND_MY_STRUCTURES]: room =>
		lookFor(room, C.LOOK_STRUCTURES).filter(structure => structure.my),
	[C.FIND_HOSTILE_STRUCTURES]: room =>
		lookFor(room, C.LOOK_STRUCTURES).filter(structure => structure.my === false),
});
export interface Find { builtin: typeof builtinFind }

// Convert a FIND_ constant to result type
export type FindType<Find extends FindConstants> = ReturnType<KeyFor<FindHandlers, Find>>[number];
