import type { ContextConsole } from './context.js';
import * as util from 'node:util';

export interface CliWriteStream {
	write: (chunk: string) => unknown;
}

export interface CliStreams {
	stdout: CliWriteStream;
	stderr: CliWriteStream;
}

export interface BufferedConsole extends ContextConsole {
	logs: string[];
	warnings: string[];
	errors: string[];
}

function format(args: readonly unknown[]) {
	return util.formatWithOptions({ colors: false }, ...args);
}

export function createStreamingConsole(streams: CliStreams): ContextConsole {
	const writeOut = (...args: unknown[]) => streams.stdout.write(`${format(args)}\n`);
	const writeErr = (...args: unknown[]) => streams.stderr.write(`${format(args)}\n`);
	return {
		error: writeErr,
		info: writeOut,
		log: writeOut,
		warn: writeErr,
	};
}

export function createBufferedConsole(): BufferedConsole {
	const logs: string[] = [];
	const warnings: string[] = [];
	const errors: string[] = [];
	const append = (bucket: string[]) => (...args: unknown[]) => bucket.push(format(args));
	return {
		errors,
		logs,
		warnings,
		error: append(errors),
		info: append(logs),
		log: append(logs),
		warn: append(warnings),
	};
}
