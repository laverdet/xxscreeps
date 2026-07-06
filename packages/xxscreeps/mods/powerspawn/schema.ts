import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import { powerSpawnStoreFormat } from './store.js';

/** @internal */
export const powerSpawnShape = declare('PowerSpawn', struct(ownedStructureShape, {
	...variant('powerSpawn'),
	hits: 'int32',
	store: powerSpawnStoreFormat,
}));
