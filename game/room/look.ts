import { lookConstants } from './symbols';

import 'xxscreeps/config/mods/game';
import * as C from 'xxscreeps/game/constants';
import type { ConstructionSite } from 'xxscreeps/game/objects/construction-site';
import type { Creep } from 'xxscreeps/game/objects/creep';
import type { Flag } from 'xxscreeps/game/flag';
import type { Resource } from 'xxscreeps/game/objects/resource';
import type { AnyStructure } from 'xxscreeps/game/objects/structures';
import type { UnwrapArray } from 'xxscreeps/util/types';

// Registers a LOOK_ constant and returns type information
export { lookConstants };
export function registerLook<Type>() {
	return <Look extends string>(key: Look): void | { look: Look; type: Type } => {
		lookConstants.add(key as never);
	};
}

// Built-in LOOK_ constants
const builtinLook = [
	registerLook<ConstructionSite>()(C.LOOK_CONSTRUCTION_SITES),
	registerLook<Creep>()(C.LOOK_CREEPS),
	registerLook<Flag>()(C.LOOK_FLAGS),
	registerLook<Resource>()(C.LOOK_RESOURCES),
	registerLook<AnyStructure>()(C.LOOK_STRUCTURES),
];
export interface Look { builtin: typeof builtinLook }

// All LOOK_ constants, no type information
type LookInfo = Exclude<UnwrapArray<Look[keyof Look]>, void>;
export type LookConstants = LookInfo['look'];

// Convert a LOOK_ constant to result type
export type LookType<Look extends LookConstants> = Extract<LookInfo, { look: Look }>['type'];
