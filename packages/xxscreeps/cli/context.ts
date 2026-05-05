import * as vm from 'node:vm';

export interface ContextConsole {
	log: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export interface ContextOptions {
	console: ContextConsole;
	argv?: readonly string[];
}

// Operator-scope realm. Math/JSON/Promise/etc. ride along as fresh built-ins from
// `vm.createContext`; web APIs and timers are injected from the host. `process`,
// `require`, dynamic `import()`, `Buffer`, `__dirname`, and `__filename` are
// intentionally absent.
export function createCuratedContext(options: ContextOptions) {
	const sandbox: Record<string, unknown> = {
		clearImmediate,
		clearInterval,
		clearTimeout,
		console: options.console,
		queueMicrotask,
		setImmediate,
		setInterval,
		setTimeout,
		TextDecoder,
		TextEncoder,
		URL,
		URLSearchParams,
		...options.argv === undefined ? {} : { argv: [ ...options.argv ] },
	};
	return vm.createContext(sandbox, { name: 'xxscreeps cli' });
}
