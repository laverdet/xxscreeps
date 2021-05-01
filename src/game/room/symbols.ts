import type { FindHandler } from './find';
import { XSymbol } from 'xxscreeps/schema';

export const findHandlers = new Map<number, FindHandler>();
export const lookConstants = new Set<string>();

export const EventLog = XSymbol('eventLog');
export const Objects = XSymbol('objects');

export const InsertObject = XSymbol('insertObject');
export const FlushFindCache = XSymbol('flushFindCache');
export const FlushObjects = XSymbol('flushObjects');
export const LookAt = XSymbol('lookAt');
export const LookFor = XSymbol('lookFor');
export const MoveObject = XSymbol('moveObject');
export const RemoveObject = XSymbol('removeObject');

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
