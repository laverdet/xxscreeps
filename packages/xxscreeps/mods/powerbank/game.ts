import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as PowerBank from './powerbank.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const powerBankSchema = registerVariant('Room.objects', PowerBank.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { powerbank: [ typeof powerBankSchema ] }
}

registerGlobal(PowerBank.StructurePowerBank);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructurePowerBank: typeof PowerBank.StructurePowerBank }
}
