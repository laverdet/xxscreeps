import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/driver';
import * as Fn from 'xxscreeps/utility/functional';
import * as CodeSchema from 'xxscreeps/engine/metadata/code';
import * as RoomSchema from 'xxscreeps/engine/room';
import { inspect } from 'util';
import { initializers, tickReceive, tickSend } from 'xxscreeps/driver/symbols';
import { Game, GameState, runForUser } from 'xxscreeps/game';
import { World } from 'xxscreeps/game/map';
import { RoomObject } from 'xxscreeps/game/object';
import { detach } from 'xxscreeps/schema/buffer-object';
import { setupConsole } from './console';
import { makeRequire } from './module';

export type Evaluate = (source: string, filename: string) => any;
export type Print = (fd: number, payload: string, evalResult?: boolean) => void;

declare const globalThis: any;
let me: string;
let world: World;
let require: (name: string) => any;
let print: Print;

export function initialize(evaluate: Evaluate, printFn: Print, data: InitializationPayload) {
	// Set up console
	setupConsole(print = printFn);

	// Load terrain
	world = new World(data.shardName, data.terrainBlob);

	// Invoke runtime initialization hooks
	initializers.splice(0).forEach(fn => fn(data));

	// Set up runtime
	const { modules } = CodeSchema.read(data.codeBlob);
	if (!modules.has('main')) {
		modules.set('main', '');
	}
	me = data.userId;
	require = makeRequire(modules, evaluate);
}

export function tick(data: TickPayload) {

	const { time } = data;
	const rooms = data.roomBlobs.map(RoomSchema.read);
	const state = new GameState(world, data.time, rooms);
	const [ intents ] = runForUser(me, state, Game => {
		tickReceive(data);

		// Run player loop
		globalThis.Game = Game;
		try {
			require('main').loop();
		} catch (err) {
			console.error(err);
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
