import { registerStruct } from 'xxscreeps/engine/schema/index.js';

// Track energy mined on room
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schema = registerStruct('Room', {
	'#invaderEnergyTarget': 'int32',
});
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { invader: typeof schema }
}
