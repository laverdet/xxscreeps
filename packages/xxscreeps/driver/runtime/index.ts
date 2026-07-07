import type { TickCompletion } from '../sandbox/index.js';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/engine/runner/index.js';
import type { Nullable } from 'xxscreeps/functional/types.js';
import { inspect } from 'node:util';
import * as RoomSchema from 'xxscreeps/engine/db/room.js';
import * as Code from 'xxscreeps/engine/db/user/code-schema.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game, GameState, hooks, initializeGameEnvironment, runForPlayer, userInfo } from 'xxscreeps/game/index.js';
import { World } from 'xxscreeps/game/map.js';
import { flushGlobals } from 'xxscreeps/game/runtime.js';
import { detach } from 'xxscreeps/schema/buffer-object.js';
import { setupConsole } from './console.js';
import { makeEnvironment } from './module.js';
import { flush, print, resultPrefix } from './print.js';

export type Compiler<Type = any> = {
	compile: (source: string, filename: string) => Type;
	evaluate: (module: Type, linker: (specifier: string, referrer?: string) => Type) => any;
};
export type Evaluate = (source: string, filename: string) => unknown;

function freezeClass(constructor: abstract new(...args: any[]) => any) {
	freezeProperty(constructor, 'prototype');
	for (
		let prototype = constructor.prototype as unknown;
		prototype !== null && prototype !== Object.prototype;
		prototype = Object.getPrototypeOf(prototype)
	) {
		Object.freeze(prototype);
	}
}

function freezeProperty(object: unknown, key: keyof any) {
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
	const make = <Type extends (hook: typeof mapped[0]) => Nullable<(...args: any[]) => unknown>>(select: Type) => Fn.pipe(
		mapped,
		$$ => Fn.map($$, select),
		$$ => Fn.filter($$),
		$$ => Fn.fold($$, () => {}, (left, right) => Fn.chain(left, right, Fn.chainSequenceVoid1)));
	return {
		initialize: make(hook => hook.initialize),
		receive: make(hook => hook.receive),
		send: make(hook => hook.send),
	};
}();

let me: string;
let world: World;
let requireMain: () => any;

export function initialize(compiler: Compiler, evaluate: Evaluate, data: InitializationPayload) {
	// Set up environment
	flushGlobals();
	setupConsole(print);

	// Load terrain
	world = new World(data.shardName, data.terrainBlob);

	// Invoke runtime initialization hooks
	initializeGameEnvironment();
	hooksComposed.initialize(data);
	hooksComposed.initialize = () => {};

	// Set up runtime
	me = data.userId;
	const modules = data.codeBlob ? Code.read(data.codeBlob) : new Map();
	requireMain = makeEnvironment(modules, evaluate, compiler);
}

export function tick(data: TickPayload, player = (fn: () => void) => fn()): TickCompletion {
	try {
		// Initialize rooms and data about users in those rooms
		const { time } = data;
		const rooms = data.roomBlobs.map(blob => {
			const room = RoomSchema.read(blob);
			room['#initialize']();
			return room;
		});
		if (data.usernames) {
			for (const [ userId, userName ] of Object.entries(data.usernames)) {
				userInfo.set(userId, { username: userName });
			}
		}
		const state = new GameState(world, data.time, rooms);

		// Enter user runtime context
		const tickResult: Partial<TickResult> = { usage: {} };
		const [ intents ] = runForPlayer(me, state, data, Game => {
			hooksComposed.receive(data);

			// Run player loop
			// @ts-expect-error
			globalThis.Game = Game;
			try {
				player(function thisIsWhereThePlayerCodeStarts() {
					// Read `main.loop` fresh each tick rather than caching the reference: a bot may swap
					// `module.exports.loop` after first-tick setup (e.g. the rustyscreeps wasm loader replaces
					// its bootstrap with the real loop). `require('main')` is a cache hit after the first tick.
					const main = requireMain();
					if (main.loop) {
						main.loop();
					} else {
						throw new Error('No `loop` function exported by `main` module');
					}
				});
			} catch (err: any) {
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
								value: payload.echo ? undefined : result,
							},
						});
					}
					if (payload.echo) {
						print(1, `${resultPrefix}${inspect(result, { colors: true })}`);
					}
				} catch (err: any) {
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
						print(2, err.stack ?? err.message ?? err);
					}
				}
			});
			// @ts-expect-error
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
		tickResult.intentPayloads = Fn.pipe(
			rooms,
			$$ => Fn.map($$, ({ name }) => {
				const intentsForRoom = intents.getIntentsForRoom(name);
				if (intentsForRoom) {
					return [ name, intentsForRoom ] as const;
				}
			}),
			$$ => Fn.filter($$),
			$$ => Fn.fromEntries($$));

		// Gather tick results from runtimeConnector
		hooksComposed.send(tickResult as TickResult);
		tickResult.console = flush();

		// Release shared memory
		for (const room of rooms) {
			detach(room, () => new Error(`Accessed a released object from a previous tick[${time}]`));
		}

		return {
			result: 'success',
			payload: tickResult satisfies Partial<TickResult> as TickResult,
		};

	} catch (err) {
		try {
			console.error(
				'An error was caught in the game runtime. This may be due to unsafe modifications to game prototypes by the player.',
				err);
			return {
				result: 'error',
				console: flush(),
			};
		} catch {
			return { result: 'error' };
		}
	}
}
