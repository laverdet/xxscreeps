import type { KeysOf, KeyFor, LooseBoolean } from 'xxscreeps/utility/types';
import type { Room } from './room';
import * as C from 'xxscreeps/game/constants';
import { LookFor, findHandlers, registerFindHandlers } from './symbols';
import './exit';

export type FindHandler = (room: Room) => any[];
type FindHandlers = Exclude<Find[keyof Find], void>;
export type FindConstants = KeysOf<FindHandlers>;
export { findHandlers };

// Built-in FIND_ handlers
const builtinFind = registerFindHandlers({
	[C.FIND_FLAGS]: room => room[LookFor](C.LOOK_FLAGS),
});
export interface Find { builtin: typeof builtinFind }

// Convert a FIND_ constant to result type
export type FindType<Find extends FindConstants> = ReturnType<KeyFor<FindHandlers, Find>>[number];

export type RoomFindOptions<Type = any> = {
	filter?: string | object | ((object: Type) => LooseBoolean);
};
