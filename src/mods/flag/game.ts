import type { Color } from './flag.js';
import type { TypeOf } from 'xxscreeps/schema/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import C from 'xxscreeps/game/constants/index.js';
import Fn from 'xxscreeps/utility/functional.js';
import { hooks, registerGlobal } from 'xxscreeps/game/index.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { compose, declare, vector } from 'xxscreeps/schema/index.js';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema/index.js';
import { instantiate } from 'xxscreeps/utility/utility.js';
import { Flag, acquireIntents, checkCreateFlag, format, intents } from './flag.js';
import './room.js';

// Flags are stored in a separate blob per user.. this is the schema for the blob
const schema = declare('Flags', compose(vector(format), {
	compose: flags => Fn.fromEntries(flags, flag => [ flag.name, flag ]),
	decompose: (flags: Record<string, Flag>) => Object.values(flags),
}));
export const { read, write } = makeReaderAndWriter(schema, { materialize: true, release: true });

// Register LOOK_ type for `Flag`
const look = registerLook<Flag>()(C.LOOK_FLAGS);
const find = registerFindHandlers({
	[C.FIND_FLAGS]: room => room['#lookFor'](C.LOOK_FLAGS),
});
declare module 'xxscreeps/game/room' {
	interface Find { flag: typeof find }
	interface Look { flag: typeof look }
}

// Export `Flag` to runtime globals
declare module 'xxscreeps/game/runtime' {
	interface Global { Flag: typeof Flag }
}
registerGlobal(Flag);
let flags: TypeOf<typeof schema> = Object.create(null);

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
declare module 'xxscreeps/game/game' {
	interface Game {
		flags: Record<string, Flag>;
	}
}
hooks.register('gameInitializer', (Game, data) => {
	if (data) {
		Game.flags = flags;
		const rooms = new Set<Room>();
		for (const flag of Object.values(flags)) {
			const room: Room = Game.rooms[flag.pos.roomName];
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (room) {
				room['#insertObject'](flag);
				rooms.add(room);
			} else {
				flag.room = undefined as never;
			}
		}
		Fn.forEach(rooms, room => room['#flushObjects'](null));
	}
});

// This flag mock-processor runs in the runner sandbox and simply sends back a blob if the flags have changed
let didUpdateFlags = false;
export function createFlag(name: string, posInt: number | null, color: Color, secondaryColor: Color) {
	const pos = posInt ? RoomPosition['#create'](posInt) : undefined;
	// Run create / move / setColor intent
	if (checkCreateFlag(flags, pos, name, color, secondaryColor) === C.OK) {
		const flag = flags[name];
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
