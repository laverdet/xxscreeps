import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { roomNameFormat } from 'xxscreeps/game/room/name.js';
import { resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { struct, vector } from 'xxscreeps/schema/index.js';

/** @internal */
export const orderShape = struct({
	/**
	 * The unique order ID.
	 * @public
	 */
	id: Id.format,

	/**
	 * Currently available amount to trade.
	 * @public
	 */
	amount: 'int32',

	/**
	 * The order creation time in game ticks.
	 * @public
	 */
	created: 'int32',

	/**
	 * The order creation time in milliseconds since UNIX epoch time.
	 * @public
	 */
	createdTimestamp: 'double',

	/**
	 * How many resources are left to trade via this order.
	 * @public
	 */
	remainingAmount: 'int32',

	/**
	 * One of the `RESOURCE_*` constants.
	 * @public
	 */
	resourceType: resourceEnumFormat,

	/**
	 * The room where this order is placed.
	 * @public
	 */
	roomName: roomNameFormat,

	/**
	 * The amount of resources to be traded in total.
	 * @public
	 */
	totalAmount: 'int32',

	'#buy': 'bool',
	'#price': 'double',
	'#user': Id.format,
});

// The orders this terminal backs, tracked on the terminal itself so the room pass can sync the
// advertised amounts against its stock.
export type WallStreetTerminalRoomSchema = typeof terminalSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const terminalSchema = registerStruct('StructureTerminal', {
	'#orders': vector(struct({
		id: Id.format,
		buy: 'bool',
	})),
});
