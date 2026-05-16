import type * as vm from 'node:vm';
import * as repl from 'node:repl';
import { ArgumentParser } from 'argparse';
import { installHostShims } from './eval-offline.js';
import { makeUnsafeGlobalEvaluator } from './unsafe.js';

const parser = new ArgumentParser({
	description: 'Interactive REPL evaluating in the host JS realm.',
	prog: 'xxscreeps cli',
});
parser.parse_args();

installHostShims();

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

const server = repl.start({
	eval: customEval,
	prompt: 'xxscreeps> ',
	useGlobal: true,
});

server.on('exit', () => process.exit(0));
