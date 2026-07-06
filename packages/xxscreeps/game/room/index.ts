import './room.js';
import './event-log.js';
import './find.js';
import './path.js';
import './look.js';

export type { Find } from './find.js';
export type { Look } from './look.js';
export type { AnyRoomObject } from './room.js';

export { Room } from './room.js';
export { registerFindHandlers, registerLook } from './symbols.js';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RoomSchema {}
