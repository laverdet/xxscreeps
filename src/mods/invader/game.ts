import { registerStruct } from 'xxscreeps/engine/schema';

// Track energy mined on room
const schema = registerStruct('Room', {
	'#invaderEnergyTarget': 'int32',
});
declare module 'xxscreeps/game/room' {
	interface Schema { invader: typeof schema }
}
