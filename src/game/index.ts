import { GameBase, GameState, Game as GameConstructor } from './game';
import { flush as flushPathFinder } from './path-finder';
import { IntentManager } from './intents';
import { FlushFindCache } from './room/symbols';
import './runtime';

export { defineGlobal, registerGameInitializer, registerGlobal } from './symbols';
export { GameConstructor, GameState };
export let Game: GameBase;
export let intents: IntentManager;
export let me = '';
export let userGame: GameConstructor | undefined;

/**
 * Runs a task with global user-agnostic data like `Game.getObjectById`, `Game.rooms`, and
 * `Game.time`. Used by tick processors.
 */
export function runWithState<Type>(state: GameState, task: () => Type) {
	const prev = Game;
	Game = new GameBase(state);
	try {
		return task();
	} finally {
		Game = prev;
	}
}

/*
 * Initializes `Game.me` and user-specific `room.find` and pathing information. Does not set up
 * `Game.creeps`, memory, flags, etc. Must be called from within `runTask`.
 */
export function runAsUser<Type>(userId: string, task: () => Type) {
	const prev = me;
	me = userId;
	for (const room of Object.values(Game.rooms)) {
		room[FlushFindCache]();
	}
	try {
		return task();
	} finally {
		me = prev;
		flushPathFinder();
	}
}

/**
 * Does everything `runAsUser` does except also sets up `Game.creeps`, `intents`.
 */
export function runForUser<Type>(userId: string, state: GameState, task: (game: GameConstructor) => Type) {
	return runWithState(state, () => runAsUser(userId, () => {
		try {
			const intentManager = intents = new IntentManager;
			const instance = userGame = new GameConstructor(state);
			return [ intentManager, task(instance) ] as const;
		} finally {
			userGame = undefined;
		}
		// instance.flags = flags_;
		// Visual.clear();
		/*
		const flushedRooms = new Set<Room>();
		for (const flag of Object.values(instance.flags)) {
			const room = rooms[flag.pos.roomName];
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (room) {
				flushedRooms.add(room);
				room[InsertObject](flag);
			}
		}
		Fn.map(flushedRooms, room => room[FlushObjects]);
		*/
	}));
}
