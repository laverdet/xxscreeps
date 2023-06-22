import type { TickPayload } from 'xxscreeps/engine/runner/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { World } from 'xxscreeps/game/map.js';
import './runtime.js';
import { GameBase, Game as GameConstructor, GameState } from './game.js';
import { IntentManager } from './intents.js';
import { flush as flushPathFinder } from './path-finder/index.js';
import { hooks } from './symbols.js';

export { defineGlobal, hooks, registerGlobal } from './symbols.js';
export { GameConstructor, GameState };
export let Game: GameBase;
export let intents: IntentManager;
export let me = '';
export let userGame: GameConstructor | undefined;
export const userInfo = new Map<string, { username: string }>();

type GameTask<Type> = (game: GameConstructor) => Type;

let didInit = false;
export function initializeGameEnvironment() {
	if (!didInit) {
		didInit = true;
		hooks.makeIterated('environment')();
	}
}

/**
 * Runs a task with global user-agnostic data like `Game.getObjectById`, `Game.rooms`, and
 * `Game.time`. Used by tick processors. This is the base of all the `run*` family of functions.
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
 * `Game.creeps`, memory, flags, etc. Must be called from within `runWithState`. This is used
 * directly by user intent processors, and by the backend.
 */
export function runAsUser<Type>(userId: string, task: () => Type) {
	const prev = me;
	me = userId;
	for (const room of Object.values(Game.rooms)) {
		room['#flushFindCache']();
	}
	try {
		return task();
	} finally {
		me = prev;
		flushPathFinder();
	}
}

/**
 * Runs a task with `Game` and `intents` set up. Used by player runtime and NPC.
 */
function runWithGame<Type>(userId: string, state: GameState, game: () => GameConstructor, task: GameTask<Type>) {
	return runWithState(state, () => runAsUser(userId, () => {
		try {
			const intentManager = intents = new IntentManager;
			const instance = userGame = game();
			return [ intentManager, task(instance) ] as const;
		} finally {
			intents = undefined as never;
			userGame = undefined;
		}
	}));
}

/**
 * Sets up `Game.creeps`, `intents` but does not set send `TickPayload` to `GameConstructor`, which
 * is needed by some `registerGameInitializer` hooks (`Flags`, `CPU`). Used by NPC.
 */
export function runForUser<Type>(userId: string, state: GameState, task: GameTask<Type>) {
	return runWithGame(userId, state, () => new GameConstructor(state), task);
}

/**
 * This is the full sandbox + runtime initialization wrapper.
 */
export function runForPlayer<Type>(userId: string, state: GameState, data: TickPayload, task: GameTask<Type>) {
	return runWithGame(userId, state, () => new GameConstructor(state, data), task);
}

/**
 * Runs a task which uses a single room, and will only use the game state one time. Use by
 */
export function runOneShot<Type>(world: World, room: Room, time: number, userId: string, task: () => Type) {
	const state = new GameState(world, time, [ room ]);
	return runWithState(state, () => runAsUser(userId, task));
}
