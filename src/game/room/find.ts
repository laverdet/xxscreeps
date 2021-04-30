import type { KeysOf, KeyFor, LooseBoolean } from 'xxscreeps/utility/types';
import type { Room } from './room';
import { findHandlers } from './symbols';
import './exit';

export interface Find {}
export type FindHandler = (room: Room) => any[];
type FindHandlers = Exclude<Find[keyof Find], void>;
export type FindConstants = KeysOf<FindHandlers>;
export { findHandlers };

// Convert a FIND_ constant to result type
export type FindType<Find extends FindConstants> = ReturnType<KeyFor<FindHandlers, Find>>[number];

export type RoomFindOptions<Type = any> = {
	filter?: string | object | ((object: Type) => LooseBoolean);
};
