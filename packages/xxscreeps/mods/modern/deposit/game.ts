import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { Deposit } from './deposit.js';
import { depositShape } from './schema.js';

export type DepositFind = typeof find;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_DEPOSITS]: room => room['#lookFor'](C.LOOK_DEPOSITS),
});

export type DepositLook = typeof look;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Deposit>()(C.LOOK_DEPOSITS);

export type DepositRoomSchema = typeof depositSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const depositSchema = registerVariant('Room.objects', compose(depositShape, Deposit));
