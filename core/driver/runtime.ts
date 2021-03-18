import type ivm from 'isolated-vm';
import { inspect } from 'util';

import type { Dictionary } from 'xxscreeps/utility/types';
import type { IntentListFor } from 'xxscreeps/processor';

import * as Game from 'xxscreeps/game';
// eslint-disable-next-line no-duplicate-imports
import { flushIntents, initializeIntents, intents, runForUser } from 'xxscreeps/game';
import { setupGlobals } from 'xxscreeps/game/runtime';
import * as Memory from 'xxscreeps/game/memory';
import { loadTerrainFromBuffer } from 'xxscreeps/game/map';
import { Room } from 'xxscreeps/game/room';
import { RoomObject } from 'xxscreeps/game/object';
import type { RunnerIntent } from 'xxscreeps/engine/runner/channel';
import * as FlagLib from 'xxscreeps/engine/runner/flag';
import * as UserCode from 'xxscreeps/engine/metadata/code';
import * as RoomSchema from 'xxscreeps/engine/room';
import * as RoomVisual from 'xxscreeps/game/visual';

import { setupConsole, Writer } from './console';

// Sets up prototype overlays
declare const globalThis: any;
setupGlobals(globalThis);

/**
 * TODO: lock these
 * JSON - stringify/parse
 * Math - max/min
 * global - Object, Array, TypedArrays, ArrayBuffer, SharedArrayBuffer
 * Symbol.iterator
 */

let me: string;
let flags = {};
let require: (name: string) => any;
let writeConsole: Writer;

// This is the common data between `isolated-vm` and `vm` that doesn't need any special casing
type InitializationData = {
	userId: string;
	codeBlob: Readonly<Uint8Array>;
	flagBlob?: Readonly<Uint8Array>;
	memoryBlob?: Readonly<Uint8Array>;
	terrainBlob: Readonly<Uint8Array>;
};

export function initialize(
	compileModule: (source: string, filename: string) => ((...args: any[]) => any),
	_writeConsole: Writer,
	data: InitializationData,
) {
	// Set up console
	setupConsole(writeConsole = _writeConsole);

	// Load terrain
	loadTerrainFromBuffer(data.terrainBlob);

	// Set up user information
	const { modules } = UserCode.read(data.codeBlob);
	if (!modules.has('main')) {
		modules.set('main', '');
	}
	me = data.userId;
	Memory.initialize(data.memoryBlob);
	if (data.flagBlob) {
		flags = FlagLib.read(data.flagBlob);
	}

	// Set up global `require`
	const cache = Object.create(null);
	globalThis.require = require = fullName => {
		// Allow require('./module')
		const name = fullName.replace(/^\.\//, '');
		// Check cache
		const cached = cache[name];
		if (cached !== undefined) {
			if (cached === null) {
				throw new Error(`Circular reference to module: ${name}`);
			}
			return cached;
		}
		const code = modules.get(name);
		if (code === undefined) {
			throw new Error(`Unknown module: ${name}`);
		}
		cache[name] = null;
		// Compile module and execute
		const module = {
			exports: {} as any,
		};
		const moduleFunction = compileModule(`(function(module,exports){${code}\n})`, `${name}.js`);
		const run = () => moduleFunction.apply(module, [ module, module.exports ]);
		try {
			run();
		} catch (err) {
			Object.defineProperty(cache, name, { get: () => { throw err } });
			throw err;
		}
		if (name === 'main' && module.exports.loop === undefined) {
			// If user doesn't have `loop` it means the first tick already run. Simulate a proper `loop`
			// method which runs the second time this is called.
			const loop = () => run();
			module.exports.loop = () => module.exports.loop = loop;
		}
		// Cache executed module and release code string (maybe it frees memory?)
		cache[name] = module.exports;
		modules.delete(name);
		return module.exports;
	};
}

export function initializeIsolated(
	isolate: ivm.Isolate,
	context: ivm.Context,
	writeConsoleRef: ivm.Reference<(fd: number, payload: string) => void>,
	data: InitializationData,
) {
	const compileModule = (source: string, filename: string) => {
		const script = isolate.compileScriptSync(source, { filename });
		return script.runSync(context, { reference: true }).deref();
	};
	const writeConsole = (fd: number, payload: string) =>
		writeConsoleRef.applySync(undefined, [ fd, payload ]);
	return initialize(compileModule, writeConsole, data);
}

export type TickArguments = {
	time: number;
	roomBlobs: Readonly<Uint8Array>[];
	consoleEval?: string[];
	userIntents?: RunnerIntent[];
};

export function tick({ time, roomBlobs, consoleEval, userIntents }: TickArguments) {

	initializeIntents();
	const rooms = roomBlobs.map(RoomSchema.read);
	runForUser(me, time, rooms, flags, Game => {
		globalThis.Game = Game;
		// Run player loop
		try {
			require('main').loop();
		} catch (err) {
			writeConsole(2, err.stack);
		}

		// Run console expressions
		consoleEval?.map(expr => {
			try {
				writeConsole(1, inspect(new Function('expr', 'return eval(expr)')(expr), { colors: true }), true);
			} catch (err) {
				writeConsole(2, err.stack, true);
			}
		});
	});

	// Inject user intents
	if (userIntents) {
		for (const intent of userIntents) {
			const receiver: any =
				intent.receiver === 'flags' ? 'flags' :
				Game.getObjectById(intent.receiver);
			if (receiver !== undefined) {
				if (receiver instanceof RoomObject) {
					intents.save(receiver as any, intent.intent as any, intent.params);
				} else {
					intents.push(receiver, intent.intent as any, intent.params);
				}
			}
		}
	}

	// Post-tick tasks
	const memory = Memory.flush();

	// Execute flag intents
	const intentManager = flushIntents();
	const flagIntents: IntentListFor<'flag'> | undefined = intentManager.acquireIntentsForGroup('flag');
	let flagBlob: undefined | Readonly<Uint8Array>;
	if (flagIntents !== undefined) {
		FlagLib.execute(flags, flagIntents);
		flagBlob = FlagLib.write(flags);
	}

	// Write room intents into blobs
	const roomIntents: Dictionary<IntentListFor<Room>> = intentManager.acquireIntentsForGroup('room') ?? {};
	const intentBlobs: Dictionary<SharedArrayBuffer> = Object.create(null);
	const { intentsByGroup } = intentManager;
	const roomNames = new Set(Object.keys(intentsByGroup));
	Object.keys(roomIntents).forEach(roomName => roomNames.add(roomName));
	for (const roomName of roomNames) {
		const json = JSON.stringify({
			room: roomIntents[roomName],
			objects: intentsByGroup[roomName],
		});
		const buffer = new SharedArrayBuffer(json.length * 2);
		const uint16 = new Uint16Array(buffer);
		for (let ii = 0; ii < json.length; ++ii) {
			uint16[ii] = json.charCodeAt(ii);
		}
		intentBlobs[roomName] = buffer;
	}

	// Extras
	const visualsBlob = RoomVisual.write();

	return { flagBlob, intentBlobs, visualsBlob, memory };
}
