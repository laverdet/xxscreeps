import { struct } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';

// Track energy mined on room
const schema = registerSchema('Room', struct({
	'#invaderEnergyTarget': 'int32',
}));
declare module 'xxscreeps/engine/schema' {
	interface Schema { invader: typeof schema }
}
