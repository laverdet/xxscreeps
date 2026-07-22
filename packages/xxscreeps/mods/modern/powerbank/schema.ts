import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { structureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import { powerBankStoreFormat } from './store.js';

/** @internal */
export const powerBankShape = declare('PowerBank', struct(structureShape, {
	...variant('powerBank'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructurePowerBank.hits
	 */
	hits: 'int32',

	/**
	 * A `Store` object containing the power held by this structure. Note: this member is an xxscreeps
	 * extension; the official API only exposes the amount via `power`.
	 * @public
	 */
	store: powerBankStoreFormat,
	'#nextDecayTime': 'int32',
}));

// The tick a room's next power bank is due. Placement state is authoritative on the room so it
// survives a restart; the scratch schedule driving the per-tick sweep is rebuilt from it on init.
export type PowerbankSchemaRoomSchema = typeof roomSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#nextPowerBankTime': 'int32',
});
