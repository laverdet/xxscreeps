import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/driver';
import 'xxscreeps/config/global';
import * as Fn from 'xxscreeps/utility/functional';
import * as Code from 'xxscreeps/engine/db/user/code-schema';
import * as RoomSchema from 'xxscreeps/engine/db/room';
import { inspect } from 'util';
import { initializers, tickReceive, tickSend } from 'xxscreeps/driver/symbols';
import { Game, GameState, runForUser, userInfo } from 'xxscreeps/game';
import { World } from 'xxscreeps/game/map';
import { RoomObject } from 'xxscreeps/game/object';
import { detach } from 'xxscreeps/schema/buffer-object';
import { setupConsole } from './console';
import { makeRequire } from './module';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { flushGlobals } from 'xxscreeps/config/global';

export type Evaluate = (source: string, filename: string) => any;
export type Print = (fd: number, payload: string, evalResult?: boolean) => void;

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
	const [ intents ] = runForUser(me, state, Game => {
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
			const receiver = Game.getObjectById(intent.receiver) ?? intent.receiver;
			if (receiver instanceof RoomObject) {
				intents.save(receiver as never, intent.intent as never, ...intent.params);
			} else {
				// intents.pushNamed(receiver as never, intent.intent as never, ...intent.params);
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
	const result: TickResult = { intentPayloads } as never;
	tickSend(result);

	// Release shared memory
	for (const room of rooms) {
		detach(room, () => new Error(`Accessed a released object from a previous tick[${time}]`));
	}

	return result;
}
