import { struct, XSymbol } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';

// Track energy mined on room
export const InvaderEnergyTarget = XSymbol('invaderEnergyTarget');
const schema = registerSchema('Room', struct({
	[InvaderEnergyTarget]: 'int32',
}));
declare module 'xxscreeps/engine/schema' {
	interface Schema { invader: typeof schema }
}
