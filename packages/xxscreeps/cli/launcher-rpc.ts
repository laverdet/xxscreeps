import type { LauncherRpcRequest, LauncherRpcResponse } from './socket.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import * as util from 'node:util';
import * as vm from 'node:vm';
import { configPath } from 'xxscreeps/config/raw.js';
import { listenLauncherRpc, probeSocketPath, socketPathFor } from './socket.js';
import { makeUnsafeEvaluator } from './unsafe.js';

interface StartLauncherRpcServerOptions {
	readonly socketPath?: string;
}

export async function startLauncherRpcServer(
	db: Database,
	shard: Shard,
	options: StartLauncherRpcServerOptions = {},
): Promise<() => Promise<void>> {
	const socketPath = options.socketPath ?? socketPathFor(configPath);
	if (await probeSocketPath(socketPath) === 'in-use') {
		throw new Error(`xxscreeps launcher RPC already listening on ${socketPath}`);
	}
	const listener = await listenLauncherRpc(socketPath, () => createSessionHandler(db, shard));
	let cleanupPromise: Promise<void> | undefined;
	return () => {
		cleanupPromise ??= cleanup(listener, socketPath);
		return cleanupPromise;
	};
}

async function cleanup(listener: { close: () => Promise<void> }, socketPath: string): Promise<void> {
	await listener.close();
	if (process.platform !== 'win32') {
		try { fs.unlinkSync(socketPath); } catch {}
	}
}

interface DrainedSink {
	readonly stdout: string;
	readonly stderr: string;
}

interface ConsoleSink {
	log: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

interface RecordedConsole extends ConsoleSink {
	drain: () => DrainedSink;
}

function createRecordedConsole(): RecordedConsole {
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const append = (chunks: string[]) => (...args: unknown[]) => {
		chunks.push(`${util.formatWithOptions({ colors: false }, ...args)}\n`);
	};
	return {
		error: append(stderrChunks),
		info: append(stdoutChunks),
		log: append(stdoutChunks),
		warn: append(stderrChunks),
		drain: () => ({
			stdout: stdoutChunks.join(''),
			stderr: stderrChunks.join(''),
		}),
	};
}

// One `vm.Context` per connection; the `console` proxy routes via ALS so late async logs land in their originating turn's drained sink.
function createSessionHandler(db: Database, shard: Shard) {
	const sinkStore = new AsyncLocalStorage<RecordedConsole>();
	const consoleProxy: ConsoleSink = {
		log: (...args) => sinkStore.getStore()?.log(...args),
		info: (...args) => sinkStore.getStore()?.info(...args),
		warn: (...args) => sinkStore.getStore()?.warn(...args),
		error: (...args) => sinkStore.getStore()?.error(...args),
	};
	const context = vm.createContext({
		clearInterval, clearTimeout,
		console: consoleProxy,
		db, shard,
		print: consoleProxy.log,
		setInterval, setTimeout,
	}, { name: 'xxscreeps cli' });
	return (request: LauncherRpcRequest) => {
		const sink = createRecordedConsole();
		return sinkStore.run(sink, () => evaluate(context, request, sink));
	};
}

async function evaluate(
	context: vm.Context,
	request: LauncherRpcRequest,
	sink: RecordedConsole,
): Promise<LauncherRpcResponse> {
	try {
		const evaluator = makeUnsafeEvaluator(request.expression, { context });
		if (typeof evaluator !== 'function') throw evaluator;
		const result = await evaluator();
		const { stdout, stderr } = sink.drain();
		return { ok: true, stdout, stderr, output: util.inspect(result, { colors: false }) };
	} catch (thrown) {
		const { stdout, stderr } = sink.drain();
		return { ok: false, stdout, stderr, output: formatThrown(thrown) };
	}
}

// Cross-realm Errors don't satisfy `instanceof Error`; duck-type stack / name / message.
interface ErrorLike {
	readonly name?: unknown;
	readonly message?: unknown;
	readonly stack?: unknown;
}

function formatThrown(thrown: unknown): string {
	if (typeof thrown === 'object' && thrown !== null) {
		const fields = thrown as ErrorLike;
		if (typeof fields.stack === 'string' && fields.stack !== '') return fields.stack;
		const name = typeof fields.name === 'string' ? fields.name : 'Error';
		const message = typeof fields.message === 'string' ? fields.message : util.inspect(thrown, { colors: false });
		return `${name}: ${message}`;
	}
	return String(thrown);
}
