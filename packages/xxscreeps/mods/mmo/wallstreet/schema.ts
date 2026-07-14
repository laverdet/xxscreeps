import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerStruct } from 'xxscreeps/engine/schema/index.js';
import { roomNameFormat } from 'xxscreeps/game/room/name.js';
import { resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { struct, vector } from 'xxscreeps/schema/index.js';

/** @internal */
export const orderShape = struct({
	id: Id.format,
	amount: 'int32',
	created: 'int32',
	createdTimestamp: 'double',
	remainingAmount: 'int32',
	resourceType: resourceEnumFormat,
	roomName: roomNameFormat,
	totalAmount: 'int32',
	'#buy': 'bool',
	'#price': 'double',
	'#user': Id.format,
});

// The orders this terminal backs, tracked on the terminal itself so the room pass can sync the
// advertised amounts against its stock.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const terminalSchema = registerStruct('StructureTerminal', {
	'#orders': vector(struct({
		id: Id.format,
		buy: 'bool',
	})),
});

// ---

declare module 'xxscreeps/mods/classic/brokerage/schema.js' {
	interface StructureTerminalSchema { wallstreet: [ typeof terminalSchema ] }
}
