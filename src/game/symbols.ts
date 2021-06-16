import type { Game } from './game';
import type { TickPayload } from 'xxscreeps/driver';
import { registerRuntimeConnector } from 'xxscreeps/driver';

type GameInitializer = (game: Game, data?: TickPayload) => void;
export const gameInitializers: GameInitializer[] = [];
export const globals = new Set<string>();

/**
 * Register a function which will run on newly-created `Game` objects. These will fire once per tick
 * for user environments created via `runForUser`
 */
export function registerGameInitializer(fn: GameInitializer) {
	gameInitializers.push(fn);
}

/**
 * Same as `registerGlobal` except it accepts more configuration options like
 * `Object.defineProperty`
 */
export function defineGlobal(name: string, descriptor: PropertyDescriptor) {
	globals.add(name);
	registerRuntimeConnector({
		initialize() {
			Object.defineProperty(globalThis, name, descriptor);
		},
	});
}

/**
 * Register a value which will be exported to `globalThis` inside the user sandbox runtime.
 */
export function registerGlobal(...args: [ name: string, value: any ] | [ fn: Function ]) {
	const { name, value } = args.length === 1 ?
		{ name: args[0].name, value: args[0] } :
		{ name: args[0], value: args[1] };
	defineGlobal(name, {
		configurable: true,
		enumerable: true,
		writable: true,
		value,
	});
}
