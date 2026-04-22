import type { CommandGroup } from './commands.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { inspect } from 'node:util';
import vm from 'node:vm';
import { Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import { buildCommandTree, commandSchema, formatHelp } from './commands.js';
import { hooks } from './symbols.js';

const BUILTINS: readonly { name: string; description: string }[] = [
	{ name: 'print(...args)', description: 'Print output to this session' },
	{ name: 'help(pattern?)', description: 'Show this help; filter by substring' },
	{ name: 'commands()', description: 'Return the command schema as structured JSON' },
	{ name: 'exit / quit / Ctrl+D', description: 'Disconnect from the server' },
];

const asyncTimeout = 5000;

export interface ShardEntry {
	shard: Shard;
	worldCache?: World;
}

interface OutputCapture {
	active: boolean;
	lines: string[];
}

export interface Sandbox {
	context: vm.Context;
	defaultShardName: string;
	output: AsyncLocalStorage<OutputCapture>;
	shardEntries: Map<string, ShardEntry>;
	destroyed: boolean;
	pause: PauseCoordinator;
}

/**
 * Structured result of executing a sandbox expression. `result` is always the
 * user-facing display text (with any captured `print()` output prepended) — on
 * failure it includes the error stack. `error` and `stack` are populated only
 * for handler throws so callers that want a short message or non-zero exit
 * code (admin CLI) don't have to re-parse the result string.
 */
export type ExecutionResult =
	{ readonly ok: true; readonly result: string; readonly echo: boolean } |
	{ readonly ok: false; readonly result: string; readonly error: string; readonly stack?: string };

/**
 * Serializes the "game is paused" state across all sandboxes owned by one
 * server. The pause itself lives in the shared game mutex; this class is a
 * local cache so two sandboxes in the same process don't fight over acquiring
 * it twice, and so the owner can be released on disconnect.
 */
export class PauseCoordinator {
	mutex: Mutex | undefined = undefined;
	acquiring = false;
	cleanup: { disconnect: () => void } | undefined = undefined;
	owner: Sandbox | undefined = undefined;

	async release() {
		if (this.mutex === undefined) return;
		const mutex = this.mutex;
		const cleanup = this.cleanup;
		this.mutex = undefined;
		this.cleanup = undefined;
		this.owner = undefined;
		// If unlock throws, the Lock's heartbeat keeps the key alive until process
		// exit; still drop the subscription so we don't leak a live listener.
		try {
			await mutex.unlock();
			await mutex.disconnect();
		} finally {
			cleanup?.disconnect();
		}
	}
}

function formatOutput(args: readonly unknown[]) {
	return args.map(arg =>
		typeof arg === 'string' ? arg : inspect(arg, { depth: 2 }),
	).join(' ');
}

function makeOutputWriter(
	output: AsyncLocalStorage<OutputCapture>,
	fallback: (line: string) => void,
) {
	return (...args: unknown[]) => {
		const line = formatOutput(args);
		const capture = output.getStore();
		if (capture?.active) {
			capture.lines.push(line);
		} else {
			fallback(line);
		}
	};
}

const collectSandboxProps = hooks.makeMapped('sandbox');
const collectCommandGroups = hooks.makeMapped('commands');

/**
 * Build a persistent VM context with all CLI helpers. One per connection; all
 * sandboxes served by a single server share the same `pause` coordinator so
 * operator-initiated pauses are visible across sessions.
 */
export function createSandbox(db: Database, shard: Shard, pause: PauseCoordinator): Sandbox {
	const output = new AsyncLocalStorage<OutputCapture>();
	const shardEntries = new Map<string, ShardEntry>([
		[ shard.name, { shard } ],
	]);
	const print = makeOutputWriter(output, console.log);
	const capturedConsole = {
		error: makeOutputWriter(output, console.error),
		log: print,
		warn: makeOutputWriter(output, console.warn),
	};
	// Uninitialized so a hook that (mis)uses `getSandbox` during registration
	// crashes visibly (TDZ) instead of seeing `undefined`. Assigned once at the
	// end of createSandbox; `const` isn't an option because it requires an initializer.
	// eslint-disable-next-line prefer-const
	let sandbox!: Sandbox;
	const getSandbox = () => sandbox;
	const defaultEntry = shardEntries.get(shard.name)!;

	const modProps: Record<string, unknown> = {};
	for (const props of collectSandboxProps(db, shard, getSandbox, defaultEntry)) {
		Object.assign(modProps, props);
	}

	// Preserve mod registration order so help/completion are stable.
	const allGroups: CommandGroup[] = [];
	for (const groups of collectCommandGroups(db, shard, getSandbox, defaultEntry)) {
		for (const group of groups) allGroups.push(group);
	}
	const commandTree = buildCommandTree(allGroups);

	sandbox = {
		context: vm.createContext({
			print,
			console: capturedConsole,

			// Timer globals — vm contexts don't include them by default
			setTimeout,
			setInterval,
			clearTimeout,
			clearInterval,

			...modProps,
			...commandTree,

			help: (pattern?: string) => formatHelp(allGroups, BUILTINS, pattern),
			commands: () => commandSchema(allGroups),
		}),
		defaultShardName: shard.name,
		destroyed: false,
		output,
		shardEntries,
		pause,
	};
	return sandbox;
}

export async function destroySandbox(sandbox: Sandbox) {
	if (sandbox.destroyed) {
		return;
	}
	sandbox.destroyed = true;
	if (sandbox.pause.owner === sandbox) {
		await sandbox.pause.release();
	}
	for (const [ name, entry ] of sandbox.shardEntries) {
		if (name !== sandbox.defaultShardName) {
			entry.shard.disconnect();
		}
	}
	sandbox.shardEntries.clear();
}

/**
 * Commands that want their successful result mirrored to the server console
 * return an `{ [ECHO]: true, result: ... }` envelope. executeExpression strips
 * the marker and sets `echo: true` on the returned ExecutionResult; the socket
 * uses that to decide whether to also log to the server's stdout. The symbol
 * stays private to this module — admin/REPL clients just see `echo` on the wire.
 */
export const ECHO = Symbol('cli-echo');

interface EchoEnvelope { readonly [ECHO]: true; readonly result: unknown }

function isEchoEnvelope(value: unknown): value is EchoEnvelope {
	return value !== null && typeof value === 'object' && ECHO in value;
}

function renderValue(value: unknown): { display: string; echo: boolean } {
	if (isEchoEnvelope(value)) {
		const inner = value.result;
		return { display: typeof inner === 'string' ? inner : inspect(inner, { depth: 4 }), echo: true };
	}
	if (value === undefined) return { display: 'undefined', echo: false };
	if (typeof value === 'string') return { display: value, echo: false };
	return { display: inspect(value, { depth: 4 }), echo: false };
}

// Run as a plain script first so multi-statement expressions keep their
// completion value (e.g. `print("hi"); 42` → 42). A SyntaxError usually means
// top-level `await` — retry through the async wrapper; other errors propagate.
function compileScript(expression: string, context: vm.Context, options: vm.RunningScriptOptions): unknown {
	try {
		return vm.runInContext(expression, context, options);
	} catch (err: unknown) {
		if (!isSyntaxError(err)) throw err;
		return compileAsync(expression, context, options)();
	}
}

// We can't actually cancel a runaway async expression — Node's vm timeout only
// covers synchronous code. On timeout we abandon the user promise; the explicit
// then() handlers below ensure a late rejection is still consumed rather than
// surfacing as an unhandled rejection. `timer.unref` keeps a pending timeout
// from blocking process exit.
function raceAsyncTimeout(raw: unknown): Promise<unknown> {
	return new Promise<unknown>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Async execution timed out')), asyncTimeout);
		timeout.unref();
		Promise.resolve(raw).then(
			value => { clearTimeout(timeout); resolve(value); },
			err => {
				clearTimeout(timeout);
				reject(err instanceof Error ? err : new Error(String(err)));
			},
		);
	});
}

function makeFailure(capture: OutputCapture, err: unknown): ExecutionResult {
	const error = err instanceof Error ? err.message : String(err);
	const stack = err instanceof Error ? err.stack : undefined;
	// CliError is operator-facing — the throw site is noise, show the message only.
	const isCli = err instanceof Error && err.name === 'CliError';
	const display = stack === undefined || isCli ? error : stack;
	const result = capture.lines.length > 0 ? capture.lines.join('\n') + '\n' + display : display;
	return stack === undefined || isCli
		? { ok: false, result, error }
		: { ok: false, result, error, stack };
}

/**
 * Primary evaluation API. Returns a structured envelope so callers (socket,
 * admin CLI) can react to echo/ok without string-parsing. The legacy
 * `executeCommand` below is a compat wrapper for tests and standalone mode.
 */
export async function executeExpression(sandbox: Sandbox, expression: string): Promise<ExecutionResult> {
	if (expression === '') {
		return { ok: true, result: 'undefined', echo: false };
	}
	if (sandbox.destroyed) {
		throw new Error('Sandbox destroyed');
	}

	const capture: OutputCapture = { active: true, lines: [] };
	return sandbox.output.run(capture, async () => {
		const vmOptions = { filename: 'cli', timeout: asyncTimeout };
		try {
			let raw: unknown;
			try {
				raw = compileScript(expression, sandbox.context, vmOptions);
			} catch (err: unknown) {
				return makeFailure(capture, err);
			}

			let resolved: unknown;
			try {
				resolved = await raceAsyncTimeout(raw);
			} catch (err: unknown) {
				return makeFailure(capture, err);
			}

			// Render is outside the per-phase catches: a throw from util.inspect is
			// not a user-facing error, it's an infrastructure problem we want to see.
			const { display, echo } = renderValue(resolved);
			const result = capture.lines.length > 0 ? capture.lines.join('\n') + '\n' + display : display;
			return { ok: true, result, echo };
		} finally {
			capture.active = false;
		}
	});
}

/** Display-text wrapper around `executeExpression`. Preserves the pre-envelope signature for tests and standalone mode. */
export async function executeCommand(sandbox: Sandbox, expression: string): Promise<string> {
	const outcome = await executeExpression(sandbox, expression);
	return outcome.result;
}

// Cross-realm errors from vm.runInContext don't satisfy `instanceof SyntaxError`.
function isSyntaxError(err: unknown): boolean {
	if (err === null || typeof err !== 'object') return false;
	return 'name' in err && err.name === 'SyntaxError';
}

// Parse as expression first, fall back to statement block on SyntaxError.
// Neither form invokes user code — side effects only happen when the returned function is called.
function compileAsync(expression: string, sandbox: vm.Context, options: vm.RunningScriptOptions) {
	try {
		return vm.runInContext(`(async()=>(${expression}))`, sandbox, options) as () => Promise<unknown>;
	} catch (err: unknown) {
		const name = err !== null && typeof err === 'object' && 'name' in err ? err.name : undefined;
		if (name !== 'SyntaxError') throw err;
		return vm.runInContext(`(async()=>{${expression}})`, sandbox, options) as () => Promise<unknown>;
	}
}
