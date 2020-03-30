import type ivm from 'isolated-vm';
import lodash from 'lodash';

import { Creep } from '~/game/objects/creep';
import { Game } from '~/game/game';
import { RoomPosition } from '~/game/position';
import { Room } from '~/game/room';
import { Source } from '~/game/objects/source';

import * as Constants from '~/game/constants';
import { gameContext, IntentManager } from '~/game/context';
import * as Memory from '~/game/memory';
import { loadTerrainFromBuffer } from '~/game/map';
import * as PathFinder from '~/game/path-finder';
import { finalizePrototypeGetters } from '~/engine/schema';
import { UserCode } from '~/engine/metabase/code';
import { BufferView } from '~/lib/schema/buffer-view';

declare const global: any;

// Global lodash compatibility
global._ = lodash;

// Export prototypes
global.Creep = Creep;
global.RoomPosition = RoomPosition;
global.Source = Source;
Memory.initialize(new Uint16Array(1));

// Set up lazy schema getters
finalizePrototypeGetters();

/**
 * TODO: lock these
 * JSON - stringify/parse
 * Math - max/min
 * global - Object, Array, TypedArrays, ArrayBuffer, SharedArrayBuffer
 * Symbol.iterator
 */

// Export constants
for (const [ identifier, value ] of Object.entries(Constants)) {
	global[identifier] = value;
}

let require: (name: string) => any;
export function initialize(
	compileModule: (source: string, filename: string) => ((...args: any[]) => any),
	userId: string, userCode: UserCode,
	terrain: Readonly<Uint8Array>,
) {
	loadTerrainFromBuffer(terrain);
	gameContext.userId = userId;
	// Index code by name
	const modulesCode = Object.create(null);
	for (const { name, data } of userCode.modules) {
		modulesCode[name] = data;
	}
	delete userCode.modules;
	// Set up global `require`
	const cache = Object.create(null);
	global.require = require = name => {
		// Check cache
		const cached = cache[name];
		if (cached !== undefined) {
			if (cached === null) {
				throw new Error(`Circular reference to module: ${name}`);
			}
			return cached;
		}
		const code = modulesCode[name];
		if (code === undefined) {
			throw new Error(`Unknown module: ${name}`);
		}
		cache[name] = null;
		// Compile module and execute
		const module = {
			exports: {} as any,
		};
		const moduleFunction = compileModule(`(function(module,exports){${code}})`, `${name}.js`);
		const run = () => moduleFunction.apply(module, [ module, module.exports ]);
		run();
		if (name === 'main' && module.exports.loop === undefined) {
			// If user doesn't have `loop` it means the first tick already run. Simulate a proper `loop`
			// method which runs the second time this is called.
			const loop = () => run();
			module.exports.loop = () => module.exports.loop = loop;
		}
		// Cache executed module and release code string (maybe it frees memory?)
		cache[name] = module.exports;
		delete modulesCode[name];
		return module.exports;
	};
}

export function initializeIsolated(
	isolate: ivm.Isolate,
	context: ivm.Context,
	userId: string,
	userCode: UserCode,
	terrain: Readonly<Uint8Array>,
) {
	const compileModule = (source: string, filename: string) => {
		const script = isolate.compileScriptSync(source, { filename });
		return script.runSync(context, { reference: true }).deref();
	};
	return initialize(compileModule, userId, userCode, terrain);
}

export function tick(time: number, roomBlobs: Readonly<Uint8Array>[]) {
	// Reset context
	gameContext.intents = new IntentManager;
	// Build game object
	const rooms = roomBlobs.map(buffer =>
		new Room(BufferView.fromTypedArray(buffer)));
	global.Game = new Game(time, rooms);
	// Run player loop
	require('main').loop();
	const memoryString = Memory.flush();
	PathFinder.flush();
	// Return JSON'd intents
	const intents = function() {
		const intents = Object.create(null);
		const { intentsByRoom } = gameContext.intents;
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
	return [
		intents,
	];
}
