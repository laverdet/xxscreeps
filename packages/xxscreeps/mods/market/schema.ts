import * as Id from 'xxscreeps/engine/schema/id.js';
import { openStoreFormat, resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, optional, struct, variant, vector } from 'xxscreeps/schema/index.js';

/** @internal */
export const terminalShape = declare('StructureTerminal', struct(ownedStructureShape, {
	...variant('terminal'),
	hits: 'int32',
	store: openStoreFormat,
	'#cooldownTime': 'int32',
	// Market orders anchored to this terminal; their state is maintained by the room's tick pass.
	'#orderIds': vector(Id.format),
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

/** @internal */
export const orderShape = struct({
	id: Id.format,
	type: 'string',
	resourceType: resourceEnumFormat,
	totalAmount: 'int32',
	remainingAmount: 'int32',
	amount: 'int32',
	roomName: 'string',
	created: 'int32',
	createdTimestamp: 'double',
	active: 'bool',
	'#price': 'double',
	'#user': Id.format,
});
