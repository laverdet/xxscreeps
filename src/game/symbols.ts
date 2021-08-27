import type { Game, GameState } from './game';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/engine/runner';
import type { Room } from 'xxscreeps/game/room';
import { makeHookRegistration } from 'xxscreeps/utility/hook';

export const globals = new Set<string>();

export const hooks = makeHookRegistration<{
	/**
	 * Hooks which runs in environments which will execute any game-code [runtime, processor,
	 * backend]. Executed once after all mod imports have finished resolving.
	 */
	environment: () => void;

	/**
	 * Register a function which will run on newly-created `Game` objects. These will fire once per tick
	 * for user environments created via `runForUser`
	 */
	gameInitializer: (game: Game, data?: TickPayload) => void;

	/**
	 * Register a function which will run on `Room` instances each tick. This runs in the runtime and
	 * processor. It may run on the same instance more than once because instances can be reused in
	 * the processor.
	 */
	roomInitializer: (room: Room, game: GameState) => void;

	/**
	 * Registers methods which will run in the player's sandbox runtime.
	 * - `initialize` will run once when the sandbox is created and receives `InitializationPayload`
	 *   from `DriverConnector#initialize`
	 * - `receive` runs before each tick and receives `TickPayload` from `DriverConnector#refresh`
	 * - `send` runs after each tick and generates `TickResult` which will be sent to
	 *   `DriverConnector#save`
	 */
	runtimeConnector: {
		initialize?: (payload: InitializationPayload) => void;
		receive?: (payload: TickPayload) => void;
		send?: (result: TickResult) => void;
	};
}>();

/**
 * Same as `registerGlobal` except it accepts more configuration options like
 * `Object.defineProperty`
 */
export function defineGlobal(name: string, descriptor: PropertyDescriptor) {
	globals.add(name);
	hooks.register('runtimeConnector', {
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
