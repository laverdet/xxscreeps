import type { LauncherRpcClient, LauncherRpcResponse } from './socket.js';
import type * as vm from 'node:vm';
import * as repl from 'node:repl';
import { ArgumentParser } from 'argparse';
import config from 'xxscreeps/config/index.js';
import { configPath } from 'xxscreeps/config/raw.js';
import { installHostShims } from './eval-offline.js';
import { connectLauncherRpc, socketPathFor } from './socket.js';
import { makeUnsafeGlobalEvaluator } from './unsafe.js';

interface LauncherMode {
	readonly kind: 'launcher';
	readonly client: LauncherRpcClient;
	readonly socketPath: string;
}
interface HostMode {
	readonly kind: 'host';
	readonly reason: string;
}
type Mode = LauncherMode | HostMode;

// Schemes whose backing storage is in-process; networked providers need their own daemon, not a Unix socket probe.
const localProviderSchemes = new Set([ 'file:', 'local:' ]);

const parser = new ArgumentParser({
	description: 'Interactive REPL. Connects to a running launcher via its RPC socket when one is detected; otherwise evaluates in the host JS realm.',
	prog: 'xxscreeps cli',
});
parser.parse_args();

const mode = await detectMode();
if (mode.kind === 'launcher') {
	startLauncherRepl(mode);
} else {
	startHostRealmRepl(mode);
}

// TODO(slice 3): per-command transport routing (Manifest.commands +
// requiresLauncher, issue 168) probes the launcher RPC lazily on its own
// path; this detection covers REPL-eval transport only.
async function detectMode(): Promise<Mode> {
	const dataUrl = new URL(config.database.data, configPath);
	if (!localProviderSchemes.has(dataUrl.protocol)) {
		const scheme = dataUrl.protocol.replace(/:$/, '');
		return { kind: 'host', reason: `database provider '${scheme}' is not local; launcher RPC skipped` };
	}
	const socketPath = socketPathFor(configPath);
	try {
		const client = await connectLauncherRpc(socketPath);
		return { kind: 'launcher', client, socketPath };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { kind: 'host', reason: `launcher RPC unavailable at ${socketPath} (${message})` };
	}
}

function startLauncherRepl(mode: LauncherMode): void {
	process.stderr.write(`xxscreeps cli: connected to launcher RPC at ${mode.socketPath}\n`);
	// `repl` fires 'exit' before queued eval callbacks; drain so piped input doesn't lose its tail.
	const inFlight = new Set<Promise<unknown>>();
	let intentionalShutdown = false as boolean;
	const server = repl.start({
		prompt: 'xxscreeps live> ',
		eval: createRpcEvaluator(mode.client, inFlight),
	});
	server.on('exit', () => {
		intentionalShutdown = true;
		void Promise.allSettled(inFlight)
			.then(() => mode.client.close())
			.finally(() => process.exit(0));
	});
	void mode.client.closed.then(() => {
		if (intentionalShutdown) return;
		process.stderr.write('xxscreeps cli: launcher RPC closed, exiting\n');
		process.exit(1);
	});
}

function createRpcEvaluator(client: LauncherRpcClient, inFlight: Set<Promise<unknown>>) {
	return (
		cmd: string,
		_context: vm.Context,
		_filename: string,
		callback: (err: Error | null, result?: unknown) => void,
	) => {
		if (cmd.trim() === '') {
			callback(null, undefined);
			return;
		}
		// Local parse only surfaces `repl.Recoverable`; the source never runs in this realm.
		const probe = makeUnsafeGlobalEvaluator(cmd);
		if (typeof probe !== 'function') {
			callback(new repl.Recoverable(probe));
			return;
		}
		const pending = client.send({ expression: cmd }).then(response => {
			renderRpcResponse(response);
			callback(null, undefined);
		}, (err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`xxscreeps cli: launcher RPC request failed: ${message}\n`);
			callback(null, undefined);
		});
		inFlight.add(pending);
		void pending.finally(() => inFlight.delete(pending));
	};
}

function renderRpcResponse(response: LauncherRpcResponse): void {
	if (response.stdout) process.stdout.write(response.stdout);
	if (response.stderr) process.stderr.write(response.stderr);
	if (response.ok) {
		process.stdout.write(`${response.output}\n`);
	} else {
		process.stderr.write(`${response.output}\n`);
	}
}

function startHostRealmRepl(mode: HostMode): void {
	process.stderr.write(`xxscreeps cli: ${mode.reason}; running direct REPL\n`);
	installHostShims();
	const server = repl.start({
		eval: hostRealmEval,
		prompt: 'xxscreeps> ',
		useGlobal: true,
	});
	server.on('exit', () => process.exit(0));
}

function hostRealmEval(
	cmd: string,
	_context: vm.Context,
	_filename: string,
	callback: (err: Error | null, result?: unknown) => void,
) {
	if (cmd.trim() === '') {
		callback(null, undefined);
		return;
	}
	const result = makeUnsafeGlobalEvaluator(cmd);
	if (typeof result === 'function') {
		result().then(
			value => callback(null, value),
			err => callback(err instanceof Error ? err : new Error(String(err))),
		);
	} else {
		callback(new repl.Recoverable(result));
	}
}
