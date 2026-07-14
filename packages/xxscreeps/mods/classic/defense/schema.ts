import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { makeSingleStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape, structureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const towerShape = declare('Tower', struct(ownedStructureShape, {
	...variant('tower'),
	hits: 'int32',
	store: makeSingleStoreFormat(),
	'#actionLog': actionLogFormat,
}));

/** @internal */
export const rampartShape = declare('Rampart', struct(ownedStructureShape, {
	...variant('rampart'),
	hits: 'int32',
	isPublic: 'bool',
	'#nextDecayTime': 'int32',
}));

/** @internal */
export const wallShape = declare('Wall', struct(structureShape, {
	...variant('constructedWall'),
	hits: 'int32',
}));
