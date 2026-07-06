import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import { Deposit } from './deposit.js';
import { depositShape } from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_DEPOSITS]: room => room['#lookFor'](C.LOOK_DEPOSITS),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Deposit>()(C.LOOK_DEPOSITS);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const depositSchema = registerVariant('Room.objects', compose(depositShape, Deposit));

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface Find { deposit: typeof find }
	interface Look { deposit: typeof look }
	interface RoomSchema { deposit: [ typeof depositSchema ] }
}
