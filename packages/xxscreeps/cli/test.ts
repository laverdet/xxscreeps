import type { LauncherRpcRequest, LauncherRpcResponse } from './socket.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as util from 'node:util';
import { instantiateTestShard } from 'xxscreeps/test/import.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { runEval } from './eval-offline.js';
import { startLauncherRpcServer } from './launcher-rpc.js';
import { connectLauncherRpc, listenLauncherRpc, probeSocketPath } from './socket.js';
import { evaluateUnsafeGlobal, makeUnsafeGlobalEvaluator } from './unsafe.js';

const xxscreepsBin = fileURLToPath(new URL('../../bin/xxscreeps.js', import.meta.url));

class TestConsole {
	readonly #previous;
	readonly #logs: string[] = [];
	readonly #errors: string[] = [];

	constructor() {
		this.#previous = globalThis.console;
		// @ts-expect-error
		globalThis.console = this;
	}

	get logs() { return this.#logs.join('\n'); }
	get errors() { return this.#errors.join('\n'); }

	static flatten(this: void, subject: unknown) {
		if (typeof subject === 'string') {
			return subject;
		} else {
			return util.inspect(subject);
		}
	}

	[Symbol.dispose]() {
		globalThis.console = this.#previous;
	}

	log(...args: unknown[]) {
		this.#logs.push(args.map(TestConsole.flatten).join(' '));
	}

	error(...args: unknown[]) {
		this.#errors.push(args.map(TestConsole.flatten).join(' '));
	}
}

interface SpawnResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

// Neutralize `FORCE_COLOR` so the child's `util.inspect` / `console.log` don't ANSI-wrap output
// the assertions match on; dev terminals frequently inherit a non-zero value.
const childEnv: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };

function spawnXxscreeps(args: readonly string[], stdin?: string, options: { cwd?: string } = {}) {
	return new Promise<SpawnResult>((resolve, reject) => {
		const child = spawn(process.execPath, [ xxscreepsBin, ...args ], {
			cwd: options.cwd,
			env: childEnv,
			stdio: [ 'pipe', 'pipe', 'pipe' ],
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
		child.on('error', reject);
		child.on('exit', code => resolve({
			exitCode: code ?? 1,
			stderr: Buffer.concat(stderrChunks).toString('utf8'),
			stdout: Buffer.concat(stdoutChunks).toString('utf8'),
		}));
		child.stdin.end(stdin ?? '');
	});
}

// Per-line stdin so each turn's response renders before the next line lands; `stdin.end(text)`
// would deliver atomically and race the REPL. The per-line gate waits for any new output (the
// previous turn's response or banner) plus a short settling window, with a hard timeout.
function spawnXxscreepsInteractive(
	args: readonly string[],
	lines: readonly string[],
	{ cwd, settleMs = 25, perLineTimeoutMs = 5000 }:
		{ cwd?: string; settleMs?: number; perLineTimeoutMs?: number } = {},
) {
	return new Promise<SpawnResult>((resolve, reject) => {
		const child = spawn(process.execPath, [ xxscreepsBin, ...args ], {
			cwd,
			env: childEnv,
			stdio: [ 'pipe', 'pipe', 'pipe' ],
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let outputBytes = 0;
		child.stdout.on('data', (chunk: Buffer) => {
			stdoutChunks.push(chunk);
			outputBytes += chunk.length;
		});
		child.stderr.on('data', (chunk: Buffer) => {
			stderrChunks.push(chunk);
			outputBytes += chunk.length;
		});
		child.on('error', reject);
		child.on('exit', code => resolve({
			exitCode: code ?? 1,
			stderr: Buffer.concat(stderrChunks).toString('utf8'),
			stdout: Buffer.concat(stdoutChunks).toString('utf8'),
		}));
		const waitForOutput = (before: number) => new Promise<void>(resolveWait => {
			let settleTimer: NodeJS.Timeout | undefined;
			const cleanup = () => {
				child.stdout.off('data', onData);
				child.stderr.off('data', onData);
				clearTimeout(hardTimer);
				if (settleTimer) clearTimeout(settleTimer);
			};
			const onData = () => {
				if (outputBytes <= before) return;
				if (settleTimer) clearTimeout(settleTimer);
				settleTimer = setTimeout(() => { cleanup(); resolveWait(); }, settleMs);
			};
			const hardTimer = setTimeout(() => { cleanup(); resolveWait(); }, perLineTimeoutMs);
			child.stdout.on('data', onData);
			child.stderr.on('data', onData);
			onData();
		});
		void (async () => {
			for (const line of lines) {
				const before = outputBytes;
				child.stdin.write(`${line}\n`);
				await waitForOutput(before);
			}
			child.stdin.end();
		})();
	});
}

let rpcCounter = 0;

function makeTempSocketPath(): string {
	return path.join(os.tmpdir(), `xxscreeps-cli-test-${process.pid}-${rpcCounter++}`, 'cli.sock');
}

interface LauncherRpcHarness {
	db: Database;
	shard: Shard;
	socketPath: string;
	[Symbol.asyncDispose]: () => Promise<void>;
}

async function startLauncherRpcHarness(): Promise<LauncherRpcHarness> {
	const testShard = await instantiateTestShard();
	const socketPath = makeTempSocketPath();
	const stop = await startLauncherRpcServer(testShard.db, testShard.shard, { socketPath });
	let stopped = false as boolean;
	return {
		db: testShard.db,
		shard: testShard.shard,
		socketPath,
		[Symbol.asyncDispose]: async () => {
			if (stopped) return;
			stopped = true;
			await stop();
			testShard[Symbol.dispose]();
			fs.rmSync(path.dirname(socketPath), { force: true, recursive: true });
		},
	};
}

async function oneShot(socketPath: string, request: LauncherRpcRequest): Promise<LauncherRpcResponse> {
	await using client = await connectLauncherRpc(socketPath);
	return await client.send(request);
}

interface CliHarness extends LauncherRpcHarness {
	// Spawned CLI's `socketPathFor(cwd/.screepsrc.yaml)` must match the launcher RPC's path.
	cwd: string;
}

async function startCliHarness(): Promise<CliHarness> {
	// `realpathSync` to canonicalize macOS `/var` → `/private/var` so the child finds the socket.
	// `.screepsrc.yaml` is left empty so the child inherits the parent's mod list — otherwise its
	// import of `xxscreeps/config/mods/index.js` would rewrite the shared `mods.static/` bundle.
	const raw = await fsp.mkdtemp(path.join(os.tmpdir(), 'xxsk-'));
	const cwd = fs.realpathSync(raw);
	await fsp.writeFile(path.join(cwd, '.screepsrc.yaml'), '{}\n');
	const configUrl = new URL('.screepsrc.yaml', `${pathToFileURL(cwd).href}/`);
	const socketPath = fileURLToPath(new URL('screeps/cli.sock', configUrl));
	const testShard = await instantiateTestShard();
	const stop = await startLauncherRpcServer(testShard.db, testShard.shard, { socketPath });
	let stopped = false as boolean;
	return {
		cwd,
		db: testShard.db,
		shard: testShard.shard,
		socketPath,
		[Symbol.asyncDispose]: async () => {
			if (stopped) return;
			stopped = true;
			await stop();
			testShard[Symbol.dispose]();
			fs.rmSync(cwd, { force: true, recursive: true });
		},
	};
}

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const raw = await fsp.mkdtemp(path.join(os.tmpdir(), 'xxsh-'));
	const cwd = fs.realpathSync(raw);
	await fsp.writeFile(path.join(cwd, '.screepsrc.yaml'), '{}\n');
	try {
		return await fn(cwd);
	} finally {
		fs.rmSync(cwd, { force: true, recursive: true });
	}
}

describe('cli', () => {
	test('repl: vars persist across turns', async () => {
		try {
			const first = await evaluateUnsafeGlobal('var __cliReplCounter = 41; __cliReplCounter');
			assert.strictEqual(first, 41);
			const second = await evaluateUnsafeGlobal('__cliReplCounter += 1');
			assert.strictEqual(second, 42);
		} finally {
			delete (globalThis as Record<string, unknown>).__cliReplCounter;
		}
	});

	test('repl: top-level await resolves', async () => {
		const value = await evaluateUnsafeGlobal('await Promise.resolve(99)');
		assert.strictEqual(value, 99);
	});

	test('repl: statement with top-level await falls through to async-block', async () => {
		// Only the async-block wrap parses this; block form has no completion value, so the IIFE returns undefined.
		using console = new TestConsole();
		try {
			const result = await evaluateUnsafeGlobal('let __cliReplY = await Promise.resolve(99); console.log(__cliReplY)');
			assert.strictEqual(result, undefined);
			assert.deepStrictEqual(console.logs, '99');
		} finally {
			delete (globalThis as Record<string, unknown>).__cliReplY;
		}
	});

	test('repl: let + await declarations persist across turns', async () => {
		try {
			const first = await evaluateUnsafeGlobal('let __cliReplAsync = await Promise.resolve(41); __cliReplAsync');
			assert.strictEqual(first, undefined);
			const second = await evaluateUnsafeGlobal('__cliReplAsync + 1');
			assert.strictEqual(second, 42);
		} finally {
			delete (globalThis as Record<string, unknown>).__cliReplAsync;
		}
	});

	test('repl: top-level await whose awaited callback throws SyntaxError runs source once', async () => {
		// A runtime SyntaxError from inside the wrap must propagate, not retrigger a wrap retry.
		using console = new TestConsole();
		await assert.rejects(
			() => evaluateUnsafeGlobal(
				'await Promise.resolve().then(() => { console.log("once"); throw new SyntaxError("boom"); })'),
			/boom/);
		assert.deepStrictEqual(console.logs, 'once');
	});

	test('repl: parenthesised top-level await falls through to async wrap', async () => {
		// In script mode `await` lexes as an identifier; the cascade must still retry through the async wrap.
		const value = await evaluateUnsafeGlobal('(await Promise.resolve(99)).valueOf()');
		assert.strictEqual(value, 99);
	});

	test('repl: SyntaxError unrelated to top-level await still rejects', async () => {
		await assert.rejects(
			() => evaluateUnsafeGlobal('1 + )'),
			(err: unknown) => err instanceof SyntaxError);
	});

	test('repl: incomplete input is reported recoverable', () => {
		assert.ok(makeUnsafeGlobalEvaluator('if (true) {') instanceof SyntaxError);
		assert.ok(makeUnsafeGlobalEvaluator('await Promise.resolve(') instanceof SyntaxError);
		assert.ok(makeUnsafeGlobalEvaluator('1 + 1') instanceof Function);
		assert.ok(makeUnsafeGlobalEvaluator('await Promise.resolve(1)') instanceof Function);
	});

	test('repl: meta-commands work in a real session', async () => {
		const result = await withTempCwd(async cwd => spawnXxscreeps([ 'cli' ], '.exit\n', { cwd }));
		assert.strictEqual(result.exitCode, 0);
	});

	test('eval: runtime SyntaxError does not retrigger console.log', async () => {
		// A runtime SyntaxError must not be mistaken for a parse failure and re-execute the source.
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [],
			source: 'console.log(1); JSON.parse("}");',
		});
		assert.strictEqual(exitCode, 1);
		const ones = (console.logs.match(/^1$/gm) ?? []).length;
		assert.strictEqual(ones, 1, `expected '1' logged exactly once, got stdout: ${JSON.stringify(console.logs)}`);
	});

	test('eval: -e prints inspected result with exit 0', async () => {
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [],
			source: 'console.log("hello"); 1 + 41',
		});
		assert.strictEqual(exitCode, 0);
		assert.strictEqual(console.errors, '');
		assert.match(console.logs, /^hello\n/);
		assert.match(console.logs, /\n42$/);
	});

	test('eval: thrown error writes to stderr with exit 1', async () => {
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [],
			source: 'throw new Error("boom")',
		});
		assert.strictEqual(exitCode, 1);
		assert.strictEqual(console.logs, '');
		assert.match(console.errors, /boom/);
	});

	test('eval: argv is exposed to the script', async () => {
		using console = new TestConsole();
		const exitCode = await runEval({
			argv: [ 'one', 'two' ],
			source: 'argv.join("|")',
		});
		assert.strictEqual(exitCode, 0);
		assert.strictEqual(console.logs, 'one|two');
	});

	test('eval: --file reads source from the filesystem', async () => {
		const file = fileURLToPath(new URL('../../cli/test-data/eval-source.js', import.meta.url));
		const result = await withTempCwd(async cwd => spawnXxscreeps([ 'eval', '--file', file ], undefined, { cwd }));
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /from-file/);
	});

	test('eval: --stdin reads source from stdin', async () => {
		const result = await withTempCwd(async cwd => spawnXxscreeps([ 'eval', '--stdin' ], '2 + 3', { cwd }));
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /^5\n$/);
	});
});

describe('launcher RPC', () => {
	test('1+1 round-trips through the socket', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, { expression: '1+1' });
		assert.deepStrictEqual(response, { ok: true, stdout: '', stderr: '', output: '2' });
	});

	test('cleanup unlinks the socket file', async () => {
		const harness = await startLauncherRpcHarness();
		const { socketPath } = harness;
		assert.strictEqual((await fsp.stat(socketPath)).isSocket(), true);
		await harness[Symbol.asyncDispose]();
		await assert.rejects(() => fsp.stat(socketPath));
	});

	test('probeSocketPath reports a missing path as available', async () => {
		if (process.platform === 'win32') return;
		const socketPath = makeTempSocketPath();
		assert.strictEqual(await probeSocketPath(socketPath), 'available');
	});

	test('probeSocketPath unlinks a zero-byte leftover and reports available', async () => {
		if (process.platform === 'win32') return;
		const socketPath = makeTempSocketPath();
		await fsp.mkdir(path.dirname(socketPath), { recursive: true });
		await fsp.writeFile(socketPath, '');
		try {
			assert.strictEqual(await probeSocketPath(socketPath), 'available');
			await assert.rejects(() => fsp.stat(socketPath));
		} finally {
			await fsp.rm(path.dirname(socketPath), { force: true, recursive: true });
		}
	});

	test('probeSocketPath reports a live listener as in-use', async () => {
		if (process.platform === 'win32') return;
		await using harness = await startLauncherRpcHarness();
		assert.strictEqual(await probeSocketPath(harness.socketPath), 'in-use');
	});

	test('starting a second launcher RPC on a live socket rejects with the path', async () => {
		if (process.platform === 'win32') return;
		await using harness = await startLauncherRpcHarness();
		await assert.rejects(
			() => startLauncherRpcServer(harness.db, harness.shard, { socketPath: harness.socketPath }),
			(err: Error) => err.message.includes(harness.socketPath));
	});

	test('unix permissions: socket 0o600, parent dir 0o700', async () => {
		if (process.platform === 'win32') return;
		await using harness = await startLauncherRpcHarness();
		const socketStat = await fsp.stat(harness.socketPath);
		const dirStat = await fsp.stat(path.dirname(harness.socketPath));
		assert.strictEqual(socketStat.mode & 0o777, 0o600);
		assert.strictEqual(dirStat.mode & 0o777, 0o700);
	});

	test('cleanup waits for an in-flight dispatch before resolving', async () => {
		// Cleanup must drain pending dispatches so an eval can't mutate state after the launcher's save defer.
		const harness = await startLauncherRpcHarness();
		const { socketPath } = harness;
		const response = oneShot(socketPath, {
			expression: 'await new Promise(r => setTimeout(() => r(99), 100))',
		});
		await new Promise<void>(resolve => { setTimeout(resolve, 25); });
		await harness[Symbol.asyncDispose]();
		assert.deepStrictEqual(await response, { ok: true, stdout: '', stderr: '', output: '99' });
		if (process.platform !== 'win32') {
			await assert.rejects(() => fsp.stat(socketPath));
		}
	});

	test('cleanup destroys connections that never sent a request', async () => {
		if (process.platform === 'win32') return;
		const harness = await startLauncherRpcHarness();
		const socket = net.connect({ path: harness.socketPath });
		socket.on('error', () => {});
		const closed = new Promise<void>(resolve => { socket.on('close', () => resolve()); });
		await new Promise<void>(resolve => { socket.once('connect', () => resolve()); });
		await harness[Symbol.asyncDispose]();
		await closed;
	});

	test('cleanup drains requests that land after pending is snapshotted', async () => {
		// A follow-up request can chain onto the same connection mid-drain; cleanup must re-snapshot until empty.
		const harness = await startLauncherRpcHarness();
		try {
			const client = await connectLauncherRpc(harness.socketPath);
			const slow = client.send({
				expression: 'await new Promise(r => setTimeout(() => r(99), 100))',
			});
			await new Promise<void>(resolve => { setTimeout(resolve, 25); });
			const cleanupP = harness[Symbol.asyncDispose]();
			const fast = client.send({ expression: '1 + 1' });
			assert.deepStrictEqual(await slow, { ok: true, stdout: '', stderr: '', output: '99' });
			assert.deepStrictEqual(await fast, { ok: true, stdout: '', stderr: '', output: '2' });
			await cleanupP;
		} finally {
			await harness[Symbol.asyncDispose]();
		}
	});

	test('malformed JSON returns an error response and does not crash', async () => {
		// Parse failures must surface as an error envelope, not an unhandled rejection.
		await using harness = await startLauncherRpcHarness();
		const decided = Promise.withResolvers<string>();
		const socket = net.connect({ path: harness.socketPath });
		const chunks: Buffer[] = [];
		socket.on('data', chunk => chunks.push(chunk));
		socket.on('end', () => decided.resolve(Buffer.concat(chunks).toString('utf8')));
		socket.on('error', err => decided.reject(err));
		socket.on('connect', () => { socket.write('not-json\n'); });
		const raw = await decided.promise;
		const response = JSON.parse(raw.trim()) as LauncherRpcResponse;
		assert.strictEqual(response.ok, false);
		assert.match(response.output, /JSON|Unexpected|Invalid/);
	});

	test('malformed request shape returns an error response', async () => {
		await using harness = await startLauncherRpcHarness();
		const decided = Promise.withResolvers<string>();
		const socket = net.connect({ path: harness.socketPath });
		const chunks: Buffer[] = [];
		socket.on('data', chunk => chunks.push(chunk));
		socket.on('end', () => decided.resolve(Buffer.concat(chunks).toString('utf8')));
		socket.on('error', err => decided.reject(err));
		socket.on('connect', () => { socket.write(`${JSON.stringify({ expression: 42 })}\n`); });
		const raw = await decided.promise;
		const response = JSON.parse(raw.trim()) as LauncherRpcResponse;
		assert.strictEqual(response.ok, false);
		assert.match(response.output, /expression must be a string/);
	});

	test('request exceeding the buffer cap returns an error response', async () => {
		if (process.platform === 'win32') return;
		await using harness = await startLauncherRpcHarness();
		const decided = Promise.withResolvers<string>();
		const socket = net.connect({ path: harness.socketPath });
		const chunks: Buffer[] = [];
		socket.on('data', chunk => chunks.push(chunk));
		socket.on('end', () => decided.resolve(Buffer.concat(chunks).toString('utf8')));
		socket.on('error', () => {});
		socket.on('connect', () => { socket.write(Buffer.alloc(2 * 1024 * 1024)); });
		const raw = await decided.promise;
		const response = JSON.parse(raw.trim()) as LauncherRpcResponse;
		assert.strictEqual(response.ok, false);
		assert.match(response.output, /exceeded maximum size/);
	});

	test('multiple newlines on the same connection dispatch in order', async () => {
		// One data event carrying both lines must dispatch in order, with the second seeing the first's binding.
		await using harness = await startLauncherRpcHarness();
		await using client = await connectLauncherRpc(harness.socketPath);
		const first = await client.send({ expression: 'var x = 41' });
		const second = await client.send({ expression: 'x + 1' });
		assert.deepStrictEqual(first, { ok: true, stdout: '', stderr: '', output: 'undefined' });
		assert.deepStrictEqual(second, { ok: true, stdout: '', stderr: '', output: '42' });
	});

	test('let / const / class declarations persist across requests like var', async () => {
		await using harness = await startLauncherRpcHarness();
		await using client = await connectLauncherRpc(harness.socketPath);
		await client.send({
			expression: 'let __replLet = 1; const __replConst = 2; class __ReplClass { ping() { return 3 } }',
		});
		const envelope = await client.send({
			expression: '({ let: typeof __replLet, const: typeof __replConst, klass: new __ReplClass().ping() })',
		});
		assert.strictEqual(envelope.ok, true);
		assert.match(envelope.output, /let: 'number'/);
		assert.match(envelope.output, /const: 'number'/);
		assert.match(envelope.output, /klass: 3/);
	});

	test('separate connections have isolated globals', async () => {
		await using harness = await startLauncherRpcHarness();
		await using clientA = await connectLauncherRpc(harness.socketPath);
		await using clientB = await connectLauncherRpc(harness.socketPath);
		await clientA.send({ expression: 'var __replIsolation = "A"' });
		const envelope = await clientB.send({ expression: 'typeof __replIsolation' });
		assert.deepStrictEqual(envelope, {
			ok: true, stdout: '', stderr: '', output: "'undefined'",
		});
	});

	test('console.log scheduled past response does not bleed into next request', async () => {
		// The deferred log fires while request 2 is the active sink; ALS routes it to request 1's drained sink.
		await using harness = await startLauncherRpcHarness();
		await using client = await connectLauncherRpc(harness.socketPath);
		await client.send({
			expression: 'setTimeout(() => console.log("leaked"), 25); "first"',
		});
		const second = await client.send({
			expression: 'await new Promise(resolve => setTimeout(() => resolve("second"), 100))',
		});
		assert.deepStrictEqual(second, {
			ok: true, stdout: '', stderr: '', output: "'second'",
		});
	});

	test('client rejects when the launcher RPC responds with a malformed envelope', async () => {
		if (process.platform === 'win32') return;
		const socketPath = makeTempSocketPath();
		await fsp.mkdir(path.dirname(socketPath), { recursive: true });
		const server = net.createServer(socket => {
			socket.on('data', () => {
				socket.write(`${JSON.stringify({ ok: 'yes' })}\n`);
				socket.end();
			});
		});
		await new Promise<void>(resolve => { server.listen(socketPath, () => resolve()); });
		try {
			await assert.rejects(
				() => oneShot(socketPath, { expression: '1' }),
				/malformed field/);
		} finally {
			await new Promise<void>(resolve => { server.close(() => resolve()); });
			fs.rmSync(path.dirname(socketPath), { force: true, recursive: true });
		}
	});

	test('chain survives a dispatch crash and serves the next request', async () => {
		// A poisoned chain would silently skip every later request; the induced crash logs one line to stderr.
		const socketPath = makeTempSocketPath();
		let calls = 0;
		const listener = await listenLauncherRpc(socketPath, () => _request => {
			calls += 1;
			if (calls === 2) return Promise.reject(new Error('induced dispatch crash'));
			return Promise.resolve({ ok: true, stdout: '', stderr: '', output: `call-${calls}` });
		});
		try {
			await using client = await connectLauncherRpc(socketPath);
			const first = await client.send({ expression: '1' });
			const second = await client.send({ expression: '2' });
			const third = await client.send({ expression: '3' });
			assert.deepStrictEqual(first, { ok: true, stdout: '', stderr: '', output: 'call-1' });
			assert.strictEqual(second.ok, false);
			assert.match(second.output, /RPC dispatch crashed/);
			assert.deepStrictEqual(third, { ok: true, stdout: '', stderr: '', output: 'call-3' });
		} finally {
			await listener.close();
			if (process.platform !== 'win32') {
				try { fs.unlinkSync(socketPath); } catch {}
				fs.rmSync(path.dirname(socketPath), { force: true, recursive: true });
			}
		}
	});

	test('concurrent connections do not bleed logs across contexts', async () => {
		await using harness = await startLauncherRpcHarness();
		const make = (label: string) =>
			`(async () => { console.log(${JSON.stringify(label)}); ` +
			'await new Promise(resolve => setTimeout(resolve, 50)); ' +
			`return ${JSON.stringify(label)}; })()`;
		const [ first, second ] = await Promise.all([
			oneShot(harness.socketPath, { expression: make('A') }),
			oneShot(harness.socketPath, { expression: make('B') }),
		]);
		assert.deepStrictEqual(first, { ok: true, stdout: 'A\n', stderr: '', output: "'A'" });
		assert.deepStrictEqual(second, { ok: true, stdout: 'B\n', stderr: '', output: "'B'" });
	});

	test('throw new Error round-trips with its stack', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, { expression: 'throw new Error("boom")' });
		assert.strictEqual(response.ok, false);
		assert.match(response.output, /Error: boom/);
	});

	test('thrown non-Error objects fall back to util.inspect', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, { expression: 'throw { reason: "weird" }' });
		assert.strictEqual(response.ok, false);
		assert.match(response.output, /reason.*weird/);
	});

	test('cross-realm Error preserves name + message through the stack', async () => {
		// vm.Context errors fail launcher-realm `instanceof Error`; the boundary duck-types stack/name/message.
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, {
			expression: 'throw Object.assign(new Error(\'cross\'), { name: \'CrossRealmError\' })',
		});
		assert.strictEqual(response.ok, false);
		assert.match(response.output, /CrossRealmError/);
		assert.match(response.output, /cross/);
	});

	test('top-level await composes with setTimeout', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, {
			expression: 'await new Promise(resolve => setTimeout(() => resolve(\'done\'), 5))',
		});
		assert.deepStrictEqual(response, { ok: true, stdout: '', stderr: '', output: "'done'" });
	});

	test('let + await falls through to the async-block wrap (no completion value)', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, {
			expression: 'let value = await Promise.resolve(7); console.log(value); value',
		});
		assert.deepStrictEqual(response, { ok: true, stdout: '7\n', stderr: '', output: 'undefined' });
	});

	test('let / const / var + await declarations all persist across requests', async () => {
		await using harness = await startLauncherRpcHarness();
		await using client = await connectLauncherRpc(harness.socketPath);
		await client.send({ expression: 'let __asyncLet = await Promise.resolve(1)' });
		await client.send({ expression: 'const __asyncConst = await Promise.resolve(2)' });
		await client.send({ expression: 'var __asyncVar = await Promise.resolve(3)' });
		const result = await client.send({ expression: '[__asyncLet, __asyncConst, __asyncVar]' });
		assert.deepStrictEqual(result, { ok: true, stdout: '', stderr: '', output: '[ 1, 2, 3 ]' });
	});

	test('object destructuring + await persists each bound name', async () => {
		await using harness = await startLauncherRpcHarness();
		await using client = await connectLauncherRpc(harness.socketPath);
		await client.send({
			expression: 'let { a: __destA, b: __destB, c: __destC = 3 } = await Promise.resolve({ a: 1, b: 2 })',
		});
		const result = await client.send({ expression: '__destA + __destB + __destC' });
		assert.deepStrictEqual(result, { ok: true, stdout: '', stderr: '', output: '6' });
	});

	test('array destructuring + await persists each bound name', async () => {
		await using harness = await startLauncherRpcHarness();
		await using client = await connectLauncherRpc(harness.socketPath);
		await client.send({
			expression: 'let [__arrA, ...__arrRest] = await Promise.resolve([10, 20, 30])',
		});
		const result = await client.send({ expression: '[__arrA, __arrRest]' });
		assert.deepStrictEqual(result, { ok: true, stdout: '', stderr: '', output: '[ 10, [ 20, 30 ] ]' });
	});

	test('class and function declarations in async source do NOT persist', async () => {
		// Hoist covers only `let`/`const`/`var`; for persistent class/fn use `let C = class { … }`.
		await using harness = await startLauncherRpcHarness();
		await using client = await connectLauncherRpc(harness.socketPath);
		await client.send({
			expression: 'class __AsyncClass {}\nfunction __asyncFn() {}\nawait Promise.resolve()',
		});
		const result = await client.send({
			expression: '[typeof __AsyncClass, typeof __asyncFn]',
		});
		assert.deepStrictEqual(result, { ok: true, stdout: '', stderr: '', output: "[ 'undefined', 'undefined' ]" });
	});

	test('console.log buffers into stdout while still returning a result', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, { expression: 'console.log("x"); 42' });
		assert.deepStrictEqual(response, { ok: true, stdout: 'x\n', stderr: '', output: '42' });
	});

	test('console.warn and console.error route into stderr', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, { expression: 'console.warn("w"); console.error("e"); 0' });
		assert.deepStrictEqual(response, { ok: true, stdout: '', stderr: 'w\ne\n', output: '0' });
	});

	test('helpers: db, shard, print, timers are bound; engine globals are not', async () => {
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, { expression: `({
			db: typeof db,
			shard: shard.name,
			print: typeof print,
			setTimeout: typeof setTimeout,
			setInterval: typeof setInterval,
			clearTimeout: typeof clearTimeout,
			clearInterval: typeof clearInterval,
			Game: typeof Game,
			Memory: typeof Memory,
			rooms: typeof rooms,
			users: typeof users,
			system: typeof system,
		})` });
		assert.strictEqual(response.ok, true);
		assert.match(response.output, /db: 'object'/);
		assert.match(response.output, new RegExp(`shard: '${harness.shard.name}'`));
		assert.match(response.output, /print: 'function'/);
		assert.match(response.output, /setTimeout: 'function'/);
		assert.match(response.output, /Game: 'undefined'/);
		assert.match(response.output, /Memory: 'undefined'/);
	});

	test('dynamic import resolves without crashing the launcher', async () => {
		// Without `importModuleDynamically` the sandbox import would reject as ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING.
		await using harness = await startLauncherRpcHarness();
		const first = await oneShot(harness.socketPath, { expression: 'import("node:fs"); 1' });
		assert.deepStrictEqual(first, { ok: true, stdout: '', stderr: '', output: '1' });
		await new Promise<void>(resolve => { setImmediate(resolve); });
		const second = await oneShot(harness.socketPath, { expression: '1 + 1' });
		assert.deepStrictEqual(second, { ok: true, stdout: '', stderr: '', output: '2' });
	});

	test('top-level-await dynamic import resolves through the host loader', async () => {
		// Async wrap must compile via `vm.Script` with `importModuleDynamically`; `vm.runInContext` drops the option.
		await using harness = await startLauncherRpcHarness();
		const response = await oneShot(harness.socketPath, {
			expression: 'await import("node:os").then(os => os.platform())',
		});
		assert.strictEqual(response.ok, true, `output: ${response.output}`);
		assert.strictEqual(response.output, `'${process.platform}'`);
	});
});

describe('cli live', () => {
	test('detects the launcher RPC and evaluates over it', async () => {
		await using harness = await startCliHarness();
		const result = await spawnXxscreeps([ 'cli' ], '1 + 1\n', { cwd: harness.cwd });
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
		assert.match(result.stderr, /connected to launcher RPC/);
		assert.match(result.stdout, /\b2\b/);
	});

	test('drains in-flight RPC responses before EOF tears down the socket', async () => {
		// `node:repl` fires 'exit' on stdin EOF before queued eval callbacks fire; atomic stdin.end
		// races line 2's response against socket teardown, so without cli.ts's drain `42` is lost.
		await using harness = await startCliHarness();
		const result = await spawnXxscreeps(
			[ 'cli' ], 'var x = 41\nx + 1\n', { cwd: harness.cwd });
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /\b42\b/);
	});

	test('streams console.log to stdout and the result follows', async () => {
		await using harness = await startCliHarness();
		const result = await spawnXxscreeps(
			[ 'cli' ], 'console.log("hi"); 42\n', { cwd: harness.cwd });
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /hi/);
		assert.match(result.stdout, /\b42\b/);
	});

	test('thrown error prints to stderr without ending the session', async () => {
		await using harness = await startCliHarness();
		const result = await spawnXxscreepsInteractive(
			[ 'cli' ], [ 'throw new Error("zap")', '1 + 1' ], { cwd: harness.cwd });
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stderr, /zap/);
		assert.match(result.stdout, /\b2\b/);
	});

	test('multi-line input recovers until the block closes', async () => {
		await using harness = await startCliHarness();
		const result = await spawnXxscreeps(
			[ 'cli' ], 'if (true) {\n  1 + 2\n}\n', { cwd: harness.cwd });
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}`);
		assert.match(result.stdout, /\b3\b/);
	});

	test('falls back to host-realm REPL when no launcher RPC is present', async () => {
		const result = await withTempCwd(async cwd => spawnXxscreepsInteractive(
			[ 'cli' ], [ '1 + 1' ], { cwd }));
		assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
		assert.match(result.stderr, /launcher RPC unavailable/);
		assert.match(result.stderr, /running direct REPL/);
		assert.match(result.stdout, /\b2\b/);
	});

	test('skips the RPC probe entirely on networked providers', async () => {
		const raw = await fsp.mkdtemp(path.join(os.tmpdir(), 'xxsn-'));
		const cwd = fs.realpathSync(raw);
		try {
			// Only `data` matters here; the rest are dummies for the merged-schema required block.
			await fsp.writeFile(path.join(cwd, '.screepsrc.yaml'), [
				'database:',
				'  data: redis://localhost/0',
				'  pubsub: redis://localhost/0',
				'  lock: ./screeps/.lock',
				'  saveInterval: 2',
				'',
			].join('\n'));
			const result = await spawnXxscreepsInteractive([ 'cli' ], [ '1 + 1' ], { cwd });
			assert.strictEqual(result.exitCode, 0, `stderr: ${result.stderr}\nstdout: ${result.stdout}`);
			assert.match(result.stderr, /database provider 'redis' is not local/);
			assert.match(result.stderr, /running direct REPL/);
			assert.match(result.stdout, /\b2\b/);
		} finally {
			fs.rmSync(cwd, { force: true, recursive: true });
		}
	});

	test('two parallel REPLs against the same launcher have isolated globals', async () => {
		await using harness = await startCliHarness();
		const [ first, second ] = await Promise.all([
			spawnXxscreeps([ 'cli' ], 'var iso = "first"; iso\n', { cwd: harness.cwd }),
			spawnXxscreeps([ 'cli' ], 'typeof iso\n', { cwd: harness.cwd }),
		]);
		assert.strictEqual(first.exitCode, 0, `stderr: ${first.stderr}`);
		assert.strictEqual(second.exitCode, 0, `stderr: ${second.stderr}`);
		assert.match(first.stdout, /'first'/);
		assert.match(second.stdout, /'undefined'/);
	});
});
