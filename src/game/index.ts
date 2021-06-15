import './runtime';
import { GameBase, Game as GameConstructor, GameState } from './game';
import { IntentManager } from './intents';
import { flush as flushPathFinder } from './path-finder';
import type { TickPayload } from 'xxscreeps/driver';

export { defineGlobal, registerGameInitializer, registerGlobal } from './symbols';
export { GameConstructor, GameState };
export let Game: GameBase;
export let intents: IntentManager;
export let me = '';
export let userGame: GameConstructor | undefined;
export const userInfo = new Map<string, { username: string }>();

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

/**
 * Runs a task with `Game` and intents assigned.
 */
function runWithGame<Type>(userId: string, state: GameState, game: () => GameConstructor, task: (game: GameConstructor) => Type) {
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

/*
 * Initializes `Game.me` and user-specific `room.find` and pathing information. Does not set up
 * `Game.creeps`, memory, flags, etc. Must be called from within `runWithState`.
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
 * Does everything `runAsUser` does except also sets up `Game.creeps`, `intents`.
 */
export function runForUser<Type>(userId: string, state: GameState, task: (game: GameConstructor) => Type) {
	return runWithGame(userId, state, () => new GameConstructor(state), task);
}

/**
 * This is the full sandbox + runtime initialization wrapper.
 */
export function runForPlayer<Type>(userId: string, state: GameState, data: TickPayload, task: (game: GameConstructor) => Type) {
	return runWithGame(userId, state, () => new GameConstructor(state, data), task);
}
