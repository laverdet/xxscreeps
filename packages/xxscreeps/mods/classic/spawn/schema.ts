import type { Spawning } from './spawn.js';
import type { Direction } from 'xxscreeps/game/position.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { makeSingleStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { composeBind, declare, optional, struct, variant, vector, withType } from 'xxscreeps/schema/index.js';

/** @internal */
export const extensionShape = declare('Extension', struct(ownedStructureShape, {
	...variant('extension'),
	hits: 'int32',
	store: makeSingleStoreFormat(),
}));

/** @internal */
export const spawningShape = struct({
	directions: optional(vector(withType<Direction>('int8'))),
	needTime: 'int32',
	'#spawnId': Id.format,
	'#spawningCreepId': Id.format,
	'#spawnTime': 'int32',
});

const [ spawningFormat, bindSpawningFormat ] = composeBind(spawningShape)<Spawning>();

/** @internal */
export { bindSpawningFormat };
export { spawningFormat };

/** @internal */
export const spawnShape = declare('Spawn', struct(ownedStructureShape, {
	...variant('spawn'),
	hits: 'int32',
	name: 'string',
	spawning: optional(spawningFormat, null),
	store: makeSingleStoreFormat(),
}));
