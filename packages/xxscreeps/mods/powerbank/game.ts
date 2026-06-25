import { registerStruct, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as PowerBank from './powerbank.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const powerBankSchema = registerVariant('Room.objects', PowerBank.format);

// The tick a room's next power bank is due. Placement state is authoritative on the room so it
// survives a restart; the scratch schedule driving the per-tick sweep is rebuilt from it on init.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#nextPowerBankTime': 'int32',
});

declare module 'xxscreeps/game/room/index.js' {
	interface Schema { powerbank: [ typeof powerBankSchema, typeof roomSchema ] }
}

registerGlobal(PowerBank.StructurePowerBank);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructurePowerBank: typeof PowerBank.StructurePowerBank }
}
