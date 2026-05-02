import type { RoomObject } from 'xxscreeps/game/object.js';
import type { FindHandler } from './find.js';

export const findHandlers = new Map<number, FindHandler>();
export interface LookAlias {
	look: string;
	matches: (object: RoomObject) => boolean;
	source: string;
}
export const lookConstants = new Set<string>();
export const lookAliasesByLook = new Map<string, LookAlias>();
export const lookAliasesBySource = new Map<string, LookAlias[]>();

// Registers a FIND_ constant and its respective handler
export function registerFindHandlers<Find extends Record<number, FindHandler>>(handlers: Find): void | Find {
	for (const key in handlers) {
		findHandlers.set(Number(key), handlers[key]);
	}
}

// Registers a LOOK_ constant and returns type information
export function registerLook<Type>() {
	return <Look extends string>(key: Look): void | { look: Look; type: Type } => {
		lookConstants.add(key);
	};
}

// Registers a LOOK_ constant backed by another LOOK_ constant
export function registerLookAlias<Type extends RoomObject>() {
	return <Look extends string>(source: string, key: Look, matches: (object: RoomObject) => object is Type): void | { look: Look; type: Type } => {
		lookConstants.add(key);
		const alias = { look: key, matches, source };
		lookAliasesByLook.set(key, alias);
		const aliases = lookAliasesBySource.get(source);
		if (aliases) {
			aliases.push(alias);
		} else {
			lookAliasesBySource.set(source, [ alias ]);
		}
	};
}
