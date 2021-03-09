import type { AnyStructure } from 'xxscreeps/game/objects/structures';
import type { Creep } from 'xxscreeps/game/objects/creep';
import type { Flag } from 'xxscreeps/game/flag';
import type { UnwrapArray } from 'xxscreeps/utility/types';

import * as C from 'xxscreeps/game/constants';
import { lookConstants } from './symbols';

// Registers a LOOK_ constant and returns type information
export { lookConstants };
export function registerLook<Type>() {
	return <Look extends string>(key: Look): void | { look: Look; type: Type } => {
		lookConstants.add(key as never);
	};
}

// Built-in LOOK_ constants
const builtinLook = [
	registerLook<Creep>()(C.LOOK_CREEPS),
	registerLook<Flag>()(C.LOOK_FLAGS),
	registerLook<AnyStructure>()(C.LOOK_STRUCTURES),
];
export interface Look { builtin: typeof builtinLook }

// All LOOK_ constants, no type information
type LookInfo = Exclude<UnwrapArray<Look[keyof Look]>, void>;
export type LookConstants = LookInfo['look'];

// Convert a LOOK_ constant to result type
export type TypeOfLook<Look extends LookConstants> = Extract<LookInfo, { look: Look }>['type'];
