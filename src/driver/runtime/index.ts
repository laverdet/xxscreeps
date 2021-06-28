import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/driver';
import 'xxscreeps/config/global';
import * as Fn from 'xxscreeps/utility/functional';
import * as Code from 'xxscreeps/engine/db/user/code-schema';
import * as RoomSchema from 'xxscreeps/engine/db/room';
import { inspect } from 'util';
import { Game, GameState, hooks, runForPlayer, userInfo } from 'xxscreeps/game';
import { World } from 'xxscreeps/game/map';
import { detach } from 'xxscreeps/schema/buffer-object';
import { setupConsole } from './console';
import { makeEnvironment } from './module';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { flushGlobals } from 'xxscreeps/config/global';

export type Compiler<Type = any> = {
	compile(source: string, filename: string): Type;
	evaluate(module: Type, linker: (specifier: string, referrer?: string) => Type): any;
};
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

const hooksComposed = function() {
	const mapped = [ ...hooks.map('runtimeConnector') ];
	return {
		initialize: Fn.chain(Fn.filter(Fn.map(mapped, hook => hook.initialize))),
		receive: Fn.chain(Fn.filter(Fn.map(mapped, hook => hook.receive))),
		send: Fn.chain(Fn.filter(Fn.map(mapped, hook => hook.send)), true),
	};
}();

declare const globalThis: any;
let me: string;
let world: World;
let loop: (() => any) | undefined;
let requireMain: () => any;
let print: Print;

export function initialize(compiler: Compiler, evaluate: Evaluate, printFn: Print, data: InitializationPayload) {
	// Set up environment
	flushGlobals();
	setupConsole(print = printFn);

	// Load terrain
	world = new World(data.shardName, data.terrainBlob);

	// Invoke runtime initialization hooks
	hooksComposed.initialize(data);
	hooksComposed.initialize = () => {};

	// Set up runtime
	me = data.userId;
	const modules = Code.read(data.codeBlob);
	requireMain = makeEnvironment(modules, evaluate, compiler);
}

export function tick(data: TickPayload) {

	// Initialize rooms and data about users in those rooms
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

	// Enter user runtime context
	const tickResult: Partial<TickResult> = { usage: {} };
	const [ intents ] = runForPlayer(me, state, data, Game => {
		hooksComposed.receive(data);

		// Run player loop
		globalThis.Game = Game;
		try {
			(function thisIsWhereThePlayerCodeStarts() {
				if (loop) {
					loop();
				} else {
					const main = requireMain();
					if (main.loop) {
						loop = main.loop;
						loop!();
					} else {
						throw new Error('No `loop` function exported by `main` module');
					}
				}
			}());
		} catch (err) {
			const lines: string[] = err.stack.split(/\n/g);
			const index = lines.findIndex(line => line.includes('thisIsWhereThePlayerCodeStarts'));
			console.error((index === -1 ? lines : lines.slice(0, index)).join('\n'));
		}

		// Run requested eval expressions
		data.eval.forEach(payload => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-implied-eval
				const result = new Function('expr', 'return eval(expr)')(payload.expr);
				if (payload.ack) {
					const ack = tickResult.evalAck ??= [];
					ack.push({
						id: payload.ack,
						result: {
							error: false,
							value: result,
						},
					});
				}
				if (payload.echo) {
					print(0, inspect(result, { colors: true }), true);
				}
			} catch (err) {
				if (payload.ack) {
					const ack = tickResult.evalAck ??= [];
					ack.push({
						id: payload.ack,
						result: {
							error: true,
							value: err.message,
						},
					});
				}
				if (payload.echo) {
					print(2, err.stack, true);
				}
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
	tickResult.intentPayloads = Fn.fromEntries(Fn.filter(Fn.map(rooms, ({ name }) => {
		const intentsForRoom = intents.getIntentsForRoom(name);
		if (intentsForRoom) {
			return [ name, intentsForRoom ];
		}
	})));

	// Gather tick results from runtimeConnector
	hooksComposed.send(tickResult as TickResult);

	// Release shared memory
	for (const room of rooms) {
		detach(room, () => new Error(`Accessed a released object from a previous tick[${time}]`));
	}

	return tickResult as TickResult;
}
