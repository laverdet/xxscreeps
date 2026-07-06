import { registerEnumerated } from 'xxscreeps/engine/schema/index.js';
import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { makeSingleStoreFormat, openStoreFormat } from 'xxscreeps/mods/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const linkShape = declare('Link', struct(ownedStructureShape, {
	...variant('link'),
	hits: 'int32',
	store: makeSingleStoreFormat(),
	'#actionLog': actionLogFormat,
	'#cooldownTime': 'int32',
}));

/** @internal */
export const storageShape = declare('Storage', struct(ownedStructureShape, {
	...variant('storage'),
	hits: 'int32',
	store: openStoreFormat,
}));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'transferEnergy');

// ---

declare module 'xxscreeps/game/schema.js' {
	interface ActionLogSchema { logistics: typeof actionSchema }
}
