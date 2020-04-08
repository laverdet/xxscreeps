import type ivm from 'isolated-vm';
import { inspect } from 'util';

import type { UserIntent } from '~/engine/service/runner';
import { flushIntents, initializeIntents, intents, runForUser } from '~/game/game';
import * as Memory from '~/game/memory';
import { loadTerrainFromBuffer } from '~/game/map';
import { Room } from '~/game/room';
import * as UserCode from '~/engine/metadata/code';
import { BufferView } from '~/lib/schema/buffer-view';

import { setupConsole, Writer } from './console';
import { setupGlobals } from './globals';

// Sets up prototype overlays
import '~/engine/schema/room';
setupGlobals();
declare const globalThis: any;

/**
 * TODO: lock these
 * JSON - stringify/parse
 * Math - max/min
 * global - Object, Array, TypedArrays, ArrayBuffer, SharedArrayBuffer
 * Symbol.iterator
 */

let me: string;
let require: (name: string) => any;
let writeConsole: Writer;

// This is the common data between `isolated-vm` and `vm` that doesn't need any special casing
type InitializationData = {
	userId: string;
	codeBlob: Readonly<Uint8Array>;
	memoryBlob?: Readonly<Uint8Array>;
	terrain: Readonly<Uint8Array>;
};

export function initialize(
	compileModule: (source: string, filename: string) => ((...args: any[]) => any),
	_writeConsole: Writer,
	data: InitializationData,
) {
	// Set up console
	setupConsole(writeConsole = _writeConsole);

	// Load terrain
	loadTerrainFromBuffer(data.terrain);

	// Set up user information
	const { modules } = UserCode.read(data.codeBlob);
	if (!modules.has('main')) {
		modules.set('main', '');
	}
	me = data.userId;
	Memory.initialize(data.memoryBlob);

	// Set up global `require`
	const cache = Object.create(null);
	globalThis.require = require = name => {
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
	userIntents?: UserIntent[];
};

export function tick({ time, roomBlobs, consoleEval, userIntents }: TickArguments) {
	// Run player loop
	initializeIntents();
	const rooms = roomBlobs.map(buffer =>
		new Room(BufferView.fromTypedArray(buffer)));
	try {
		runForUser(me, time, rooms, Game => {
			globalThis.Game = Game;
			require('main').loop();
		});
	} catch (err) {
		writeConsole(2, err.stack);
	}

	// Run console expressions
	const consoleResults = consoleEval?.map(expr => {
		try {
			writeConsole(1, inspect(new Function('expr', 'return eval(expr)')(expr), { colors: true }), true);
		} catch (err) {
			writeConsole(2, err.stack, true);
		}
	});

	// Run user intents
	if (userIntents) {
		for (const intent of userIntents) {
			intents.getIntentsForRoomAndId(intent.room, intent.id)[intent.intent] = true;
		}
	}

	// Post-tick tasks
	const memory = Memory.flush();

	// Return JSON'd intents
	const intentsBlobs = function() {
		const intents: Dictionary<SharedArrayBuffer> = Object.create(null);
		const { intentsByRoom } = flushIntents();
		const roomNames = Object.keys(intentsByRoom);
		const { length } = roomNames;
		for (let ii = 0; ii < length; ++ii) {
			const roomName = roomNames[ii];
			const json = JSON.stringify(intentsByRoom[roomName]);
			const buffer = new SharedArrayBuffer(json.length * 2);
			const uint16 = new Uint16Array(buffer);
			for (let ii = 0; ii < json.length; ++ii) {
				uint16[ii] = json.charCodeAt(ii);
			}
			intents[roomName] = buffer;
		}
		return intents;
	}();
	return { consoleResults, intents: intentsBlobs, memory };
}
