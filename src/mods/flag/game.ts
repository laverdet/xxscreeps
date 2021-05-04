import type { Color } from './flag';
import type { FlagIntent } from './model';
import type { TypeOf } from 'xxscreeps/schema';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { registerGameInitializer, registerGlobal } from 'xxscreeps/game';
import { registerRuntimeConnector } from 'xxscreeps/driver';
import { LookFor, registerFindHandlers, registerLook } from 'xxscreeps/game/room';
import { RoomPosition } from 'xxscreeps/game/position';
import { compose, declare, vector } from 'xxscreeps/schema';
import { makeReaderAndWriter } from 'xxscreeps/engine/schema';
import { instantiate } from 'xxscreeps/utility/utility';
import { Flag, checkCreateFlag, format } from './flag';
import './room';

// Flags are stored in a separate blob per user.. this is the schema for the blob
const schema = declare('Flags', compose(vector(format), {
	compose: flags => Fn.fromEntries(flags, flag => [ flag.name, flag ]),
	decompose: (flags: Record<string, Flag>) => Object.values(flags),
}));
export const { read, write } = makeReaderAndWriter(schema);

// Register LOOK_ type for `Flag`
const look = registerLook<Flag>()(C.LOOK_FLAGS);
const find = registerFindHandlers({
	[C.FIND_FLAGS]: room => room[LookFor](C.LOOK_FLAGS),
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

// Read flag payload on user sandbox initialization
declare module 'xxscreeps/driver' {
	interface InitializationPayload {
		flagBlob: Readonly<Uint8Array> | null;
	}
	interface TickPayload {
		flagIntents: typeof intents;
	}
	interface TickResult {
		flagNextBlob: Readonly<Uint8Array> | null;
	}
}
let flags: TypeOf<typeof schema> = Object.create(null);

// Update user flag blob
registerRuntimeConnector({
	initialize(payload) {
		if (payload.flagBlob) {
			flags = read(payload.flagBlob);
		}
	},

	receive(payload) {
		intents.push(...payload.flagIntents);
	},

	send(payload) {
		for (const intent of intents) {
			if (intent.type === 'create') {
				createFlag(...intent.params);
			} else if (intent.type === 'remove') {
				removeFlag(...intent.params);
			}
		}
		intents = [];
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
registerGameInitializer(Game => Game.flags = flags);

// This flag mock-processor runs in the runner sandbox and simply sends back a blob if the flags have changed
let didUpdateFlags = false;
export let intents: FlagIntent[] = [];

export function createFlag(name: string, posInt: number, color: Color, secondaryColor: Color) {
	const pos = new RoomPosition(posInt);
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
			flag.pos = pos;
			didUpdateFlags = true;
		} else {
			// Creating a new flag
			flags[name] = instantiate(Flag, {
				id: null as never,
				pos,
				name,
				color, secondaryColor,
			});
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
