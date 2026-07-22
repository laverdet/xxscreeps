import type { Color } from './flag.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { TypeOf } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { compose, declare, vector } from 'xxscreeps/schema/index.js';
import { instantiate } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { Flag, acquireIntents, checkCreateFlag, intents } from './flag.js';
import { flagShape } from './schema.js';
import './room.js';

// Flags are stored in a separate blob per user.. this is the schema for the blob
const schema = declare('Flags', compose(vector(compose(flagShape, Flag)), {
	compose: flags => Fn.fromEntries(flags, flag => [ flag.name, flag ]),
	decompose: (flags: Record<string, Flag>) => Object.values(flags),
}));
export const { read, write, upgrade } = makeReaderAndWriter(schema, { materialize: true, release: true });

// Register LOOK_ type for `Flag`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Flag>()(C.LOOK_FLAGS);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_FLAGS]: room => room['#lookFor'](C.LOOK_FLAGS),
});

// Export `Flag` to runtime globals
registerGlobal(Flag);
let flags = Object.create(null) as TypeOf<typeof schema>;

// Update user flag blob
hooks.register('runtimeConnector', {
	initialize(payload) {
		if (payload.flagBlob) {
			flags = read(payload.flagBlob);
		}
	},

	receive(payload) {
		intents.push(...payload.flagIntents);
	},

	send(payload) {
		for (const intent of acquireIntents()) {
			if (intent.type === 'create') {
				createFlag(...intent.params);
			} else if (intent.type === 'remove') {
				removeFlag(...intent.params);
			}
		}
		if (didUpdateFlags) {
			didUpdateFlags = false;
			payload.flagNextBlob = write(flags);
		}
	},
});

// Add `flags` to global `Game` object
hooks.register('gameInitializer', (Game, data) => {
	if (data) {
		Game.flags = flags;
		const rooms = new Set<Room>();
		for (const flag of Object.values(flags)) {
			const room = Game.rooms[flag.pos.roomName];
			if (room) {
				room['#insertObject'](flag);
				rooms.add(room);
			} else {
				flag.room = undefined as never;
			}
		}
		for (const room of rooms) {
			room['#flushObjects'](null);
		}
	}
});

// This flag mock-processor runs in the runner sandbox and simply sends back a blob if the flags have changed
let didUpdateFlags = false;
export function createFlag(name: string, posInt: number | null, color: Color, secondaryColor: Color) {
	const pos = posInt === null ? undefined : RoomPosition['#create'](posInt);
	// Run create / move / setColor intent
	if (checkCreateFlag(flags, pos, name, color, secondaryColor) === C.OK) {
		const flag = flags[name];
		if (flag) {
			// Modifying an existing flag
			// nb: This branch will be taken in the case `Room#createFlag` is called since that function
			// automatically creates a Flag object
			flag.color = color;
			flag.secondaryColor = secondaryColor;
			if (pos) {
				flag.pos = pos;
				flag['#posId'] = pos['#id'];
			}
			didUpdateFlags = true;
		} else {
			if (!pos) return;
			// Creating a new flag
			const flag = flags[name] = instantiate(Flag, {
				id: null as never,
				pos,
				name,
				color, secondaryColor,
			});
			flag['#posId'] = pos['#id'];
			didUpdateFlags = true;
		}
	}
}

export function removeFlag(name: string) {
	if (name in flags) {
		delete flags[name];
		didUpdateFlags = true;
	}
}

// ---

declare module 'xxscreeps/game/game.js' {
	interface Game {
		/**
		 * A hash containing all your flags with flag names as hash keys.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.flags
		 */
		flags: Record<string, Flag>;
	}
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global { Flag: typeof Flag }
}

declare module 'xxscreeps:mods/game' {
	interface Find { flag: typeof find }
	interface Look { flag: typeof look }
}
