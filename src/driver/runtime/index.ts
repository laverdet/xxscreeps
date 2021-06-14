import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/driver';
import 'xxscreeps/config/global';
import * as Fn from 'xxscreeps/utility/functional';
import * as Code from 'xxscreeps/engine/db/user/code-schema';
import * as RoomSchema from 'xxscreeps/engine/db/room';
import { inspect } from 'util';
import { initializers, tickReceive, tickSend } from 'xxscreeps/driver/symbols';
import { Game, GameState, runForPlayer, userInfo } from 'xxscreeps/game';
import { World } from 'xxscreeps/game/map';
import { detach } from 'xxscreeps/schema/buffer-object';
import { setupConsole } from './console';
import { makeRequire } from './module';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { flushGlobals } from 'xxscreeps/config/global';

export type Evaluate = (source: string, filename: string) => any;
export type Print = (fd: number, payload: string, evalResult?: boolean) => void;

function freezeClass(constructor: abstract new(...args: any[]) => any) {
	freezeProperty(constructor, 'prototype');
	for (
		let prototype = constructor.prototype;
		prototype !== null && prototype !== Object.prototype;
		prototype = Object.getPrototypeOf(prototype)
	) {
		Object.freeze(prototype);
	}
}

function freezeProperty(object: {}, key: keyof any) {
	const info = Object.getOwnPropertyDescriptor(object, key)!;
	info.configurable = false;
	info.writable = false;
	Object.defineProperty(object, key, info);
}

// `iterator` can be used to override the behavior of the spread operator
freezeProperty(Array.prototype, Symbol.iterator);

// These all need to be locked down to prevent write access to shared terrain state
const typedArrays = [
	'ArrayBuffer',
	'SharedArrayBuffer',
	'Uint8Array',
	'Uint16Array',
	'Uint32Array',
	'Int8Array',
	'Int16Array',
	'Int32Array',
	'Float64Array',
] as const;
for (const key of typedArrays) {
	freezeProperty(globalThis, key);
	freezeClass(globalThis[key]);
}

declare const globalThis: any;
let me: string;
let world: World;
let require: (name: string) => any;
let print: Print;

export function initialize(evaluate: Evaluate, printFn: Print, data: InitializationPayload) {
	// Set up environment
	flushGlobals();
	setupConsole(print = printFn);

	// Load terrain
	world = new World(data.shardName, data.terrainBlob);

	// Invoke runtime initialization hooks
	initializers.splice(0).forEach(fn => fn(data));

	// Set up runtime
	const modules = Code.read(data.codeBlob);
	if (!modules.has('main')) {
		modules.set('main', '');
	}
	me = data.userId;
	require = makeRequire(modules, evaluate);
}

export function tick(data: TickPayload) {

	const { time } = data;
	const rooms = data.roomBlobs.map(blob => {
		const room = RoomSchema.read(blob);
		room['#initialize']();
		return room;
	});
	if (data.usernames) {
		for (const userId in data.usernames) {
			userInfo.set(userId, { username: data.usernames[userId] });
		}
	}

	const state = new GameState(world, data.time, rooms);
	const [ intents ] = runForPlayer(me, state, data, Game => {
		tickReceive(data);

		// Run player loop
		globalThis.Game = Game;
		try {
			(function thisIsWhereThePlayerCodeStarts() {
				require('main').loop();
			}());
		} catch (err) {
			const lines: string[] = err.stack.split(/\n/g);
			const index = lines.findIndex(line => line.includes('thisIsWhereThePlayerCodeStarts'));
			console.error(lines.slice(0, index).join('\n'));
		}

		// Run console expressions
		data.consoleEval?.map(expr => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-implied-eval
				print(0, inspect(new Function('expr', 'return eval(expr)')(expr), { colors: true }), true);
			} catch (err) {
				print(2, err.stack, true);
			}
		});
		globalThis.Game = undefined;
	});

	// Inject user intents
	if (data.backendIntents) {
		for (const intent of data.backendIntents) {
			const receiver = Game.getObjectById(intent.receiver);
			if (receiver) {
				intents.save(receiver as never, intent.intent as never, ...intent.params as never);
			} else {
				// intents.pushNamed(intent.receiver as never, intent.intent as never, ...intent.params);
			}
		}
	}

	// Write room intents into blobs
	const intentPayloads = Fn.fromEntries(Fn.filter(Fn.map(rooms, ({ name }) => {
		const intentsForRoom = intents.getIntentsForRoom(name);
		if (intentsForRoom) {
			return [ name, intentsForRoom ];
		}
	})));

	// Gather tick results
	const result: Partial<TickResult> = {
		intentPayloads,
		usage: {},
	};
	tickSend(result as TickResult);

	// Release shared memory
	for (const room of rooms) {
		detach(room, () => new Error(`Accessed a released object from a previous tick[${time}]`));
	}

	return result as TickResult;
}
