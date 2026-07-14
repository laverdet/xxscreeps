import * as Id from 'xxscreeps/engine/schema/id.js';
import { openStoreFormat, resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, optional, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const terminalShape = declare('StructureTerminal', struct(ownedStructureShape, {
	...variant('terminal'),
	hits: 'int32',
	store: openStoreFormat,
	'#cooldownTime': 'int32',
}));

/** @internal */
export const transactionShape = struct({
	transactionId: Id.format,
	time: 'int32',
	resourceType: resourceEnumFormat,
	amount: 'int32',
	from: 'string',
	to: 'string',
	'#sender': Id.format,
	'#recipient': Id.format,
	'#description': optional('string'),
});
