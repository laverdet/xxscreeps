import type { StructureTerminalSchema } from 'xxscreeps:mods/game';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { structForPath } from 'xxscreeps/engine/schema/index.js';
import { openStoreFormat, resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, optional, struct, variant } from 'xxscreeps/schema/index.js';

// Terminal schema (moddable)
export const terminalShape = declare('StructureTerminal', () =>
	struct(...structForPath<StructureTerminalSchema>()('StructureTerminal', ownedStructureShape, {
		...variant('terminal'),
		/**
		 * The current amount of hit points of the structure.
		 * @public
		 * @see https://docs.screeps.com/api/#StructureTerminal.hits
		 */
		hits: 'int32',

		/**
		 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this
		 * structure.
		 * @public
		 * @see https://docs.screeps.com/api/#StructureTerminal.store
		 */
		store: openStoreFormat,

		'#cooldownTime': 'int32',
	})));

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
