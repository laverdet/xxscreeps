import { member, struct } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';

// Track energy mined on room
export const InvaderEnergyTarget = Symbol('invaderEnergyTarget');
const schema = registerSchema('Room', struct({
	invaderEnergyTarget: member(InvaderEnergyTarget, 'uint32'),
}));
declare module 'xxscreeps/engine/schema' {
	interface Schema { invader: typeof schema }
}
