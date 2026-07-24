import { registerStruct } from 'xxscreeps/engine/schema/index.js';

// Track energy mined on room
export type InvaderRoomSchema = typeof roomSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const roomSchema = registerStruct('Room', {
	'#invaderEnergyTarget': 'int32',
});
