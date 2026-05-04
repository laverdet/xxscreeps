import type { FindHandler } from './find.js';

export const findHandlers = new Map<number, FindHandler>();
export const lookConstants = new Set<string>();

// Registers a FIND_ constant and its respective handler
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export function registerFindHandlers<Find extends Record<number, FindHandler>>(handlers: Find): Find | void {
	for (const [ key, handler ] of Object.entries(handlers)) {
		findHandlers.set(Number(key), handler);
	}
}

// Registers a LOOK_ constant and returns type information
export function registerLook<Type>() {
	return <Look extends string>(key: Look): void | { look: Look; type: Type } => {
		lookConstants.add(key);
	};
}
