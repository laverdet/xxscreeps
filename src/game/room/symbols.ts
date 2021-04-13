import type { FindHandler } from './find';
import type { LookConstants } from './look';
import { XSymbol } from 'xxscreeps/schema';

export const findHandlers = new Map<number, FindHandler>();
export const lookConstants = new Set<LookConstants>();

export const FlushFindCache = Symbol('flushFindCache');
export const LookFor = Symbol('lookFor');
export const MoveObject = Symbol('moveObject');
export const Objects = XSymbol('objects');
export const InsertObject = Symbol('insertObject');
export const RemoveObject = Symbol('removeObject');
