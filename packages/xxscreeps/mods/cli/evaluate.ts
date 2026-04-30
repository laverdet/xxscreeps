import type { GameConstructor, GameState } from 'xxscreeps/game/index.js';
import * as vm from 'node:vm';
import { runForUser } from 'xxscreeps/game/index.js';

function compile(source: string): vm.Script {
	// Try direct script compilation first. This keeps `var` declarations on globalThis so they
	// persist across REPL turns, mirroring node:repl's default behavior. The retries below run
	// only if direct compile fails (typically top-level `await`); execution never runs twice.
	try {
		return new vm.Script(source, { filename: 'cli' });
	} catch (err) {
		if (!(err instanceof SyntaxError)) {
			throw err;
		}
	}
	try {
		return new vm.Script(`(async()=>(${source}\n))()`, { filename: 'cli' });
	} catch (err) {
		if (!(err instanceof SyntaxError)) {
			throw err;
		}
	}
	return new vm.Script(`(async()=>{${source}\n})()`, { filename: 'cli' });
}

/**
 * Compile and evaluate `source` against a snapshot of committed shard state. Each call enters a
 * fresh `runForUser` scope with no userId, so per-user collections (`Game.creeps`, `Game.spawns`,
 * ...) come back empty while `Game.rooms` reflects every committed room. The expression's promise
 * is resolved outside the runtime scope, so any engine accessor used after `await` sees module
 * state reset.
 */
export function evaluate(state: GameState, source: string): Promise<unknown> {
	const script = compile(source);
	const [ , result ] = runForUser('', state, (Game: GameConstructor) => {
		Object.defineProperty(globalThis, 'Game', {
			configurable: true,
			enumerable: true,
			writable: true,
			value: Game,
		});
		return script.runInThisContext() as unknown;
	});
	return Promise.resolve(result);
}
