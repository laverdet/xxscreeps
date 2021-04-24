import type { Game } from './game';
export const gameInitializers: ((game: Game) => void)[] = [];
export const globals: Record<string, any> = Object.create(null);

/**
 * Register a function which will run on newly-created `Game` objects. These will fire once per tick
 * in the runtime, and only for user sandbox code.
 */
export function registerGameInitializer(fn: (game: Game) => void) {
	gameInitializers.push(fn);
}

/**
 * Register an object which will be exported to `globalThis` inside the user code runtime.
 */
export function registerGlobal(...args: [ name: string, value: any ] | [ fn: Function ]) {
	const { name, value } = args.length === 1 ?
		{ name: args[0].name, value: args[0] } :
		{ name: args[0], value: args[1] };
	globals[name] = value;
}
