import type { FindHandler } from './find';
import type { LookConstants } from './look';

export const findHandlers = new Map<number, FindHandler>();
export const lookConstants = new Set<LookConstants>();
