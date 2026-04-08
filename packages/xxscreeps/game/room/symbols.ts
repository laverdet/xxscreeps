import type { FindHandler } from './find.js';

export const findHandlers = new Map<number, FindHandler>();
export const lookConstants = new Set<string>();

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
