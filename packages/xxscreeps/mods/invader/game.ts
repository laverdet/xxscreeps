import { registerStruct, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { format as invaderCoreFormat } from './invader-core.js';

// Track energy mined on room
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schema = registerStruct('Room', {
	'#invaderEnergyTarget': 'int32',
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const invaderCoreSchema = registerVariant('Room.objects', invaderCoreFormat);

declare module 'xxscreeps/game/room/index.js' {
	interface Schema { invader: [ typeof schema, typeof invaderCoreSchema ] }
}
