import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { structureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import { powerBankStoreFormat } from './store.js';

/** @internal */
export const powerBankShape = declare('PowerBank', struct(structureShape, {
	...variant('powerBank'),
	hits: 'int32',
	store: powerBankStoreFormat,
	'#nextDecayTime': 'int32',
}));

// The tick a room's next power bank is due. Placement state is authoritative on the room so it
// survives a restart; the scratch schedule driving the per-tick sweep is rebuilt from it on init.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#nextPowerBankTime': 'int32',
});

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema { powerbankSchema: [ typeof roomSchema ] }
}
