import type * as vm from 'node:vm';
import * as repl from 'node:repl';
import { ArgumentParser } from 'argparse';
import { evaluateOffline, installHostShims } from './eval-offline.js';
import { recoverableSyntaxError } from './recoverable.js';

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
	const recoverable = recoverableSyntaxError(cmd);
	if (recoverable !== undefined) {
		callback(new repl.Recoverable(recoverable));
		return;
	}
	void evaluateOffline(cmd).then(
		value => callback(null, value),
		err => callback(err instanceof Error ? err : new Error(String(err))),
	);
}

const server = repl.start({
	eval: customEval,
	prompt: 'xxscreeps> ',
	useGlobal: true,
});

server.on('exit', () => process.exit(0));
