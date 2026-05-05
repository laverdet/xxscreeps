import * as repl from 'node:repl';
import * as vm from 'node:vm';
import { ArgumentParser } from 'argparse';
import { createStreamingConsole } from './console.js';
import { createCuratedContext } from './context.js';
import { evaluateInContext, recoverableSyntaxError } from './evaluate.js';

const parser = new ArgumentParser({
	description: 'Interactive REPL evaluating in a curated JS context.',
	prog: 'xxscreeps cli',
});
parser.parse_args();

const sink = createStreamingConsole({ stderr: process.stderr, stdout: process.stdout });
const context = createCuratedContext({ console: sink });

let pending: Promise<unknown> = Promise.resolve();

function customEval(
	cmd: string,
	_context: vm.Context,
	_filename: string,
	callback: (err: Error | null, result?: unknown) => void,
) {
	if (cmd.trim() === '') {
		callback(null, undefined);
		return;
	}
	const recoverable = recoverableSyntaxError(cmd);
	if (recoverable !== undefined) {
		callback(new repl.Recoverable(recoverable));
		return;
	}
	const next = pending.then(() => evaluateInContext(context, cmd, 'repl'));
	// Errors are reported via the parallel `.then` below; absorbing them here keeps
	// `pending` resolved so the next turn chains off a clean promise.
	pending = next.catch(() => {});
	next.then(
		value => callback(null, value),
		err => callback(err instanceof Error ? err : new Error(String(err))),
	);
}

const server = repl.start({
	eval: customEval,
	prompt: 'xxscreeps> ',
	useGlobal: false,
});

server.on('exit', () => {
	void pending.finally(() => process.exit(0));
});
