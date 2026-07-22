import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { StructurePowerBank } from './powerbank.js';
import { powerBankShape } from './schema.js';

registerGlobal(StructurePowerBank);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const powerBankSchema = registerVariant('Room.objects', compose(powerBankShape, StructurePowerBank));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructurePowerBank: typeof StructurePowerBank }
}

declare module 'xxscreeps:mods/game' {
	interface RoomSchema { powerbank: [ typeof powerBankSchema] }
}
