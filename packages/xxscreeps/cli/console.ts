import * as util from 'node:util';

export interface CliConsole {
	log: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export interface CliWriteStream {
	write: (chunk: string) => unknown;
	isTTY?: boolean;
}

export interface CliStreams {
	stdout: CliWriteStream;
	stderr: CliWriteStream;
}

export interface BufferedConsole extends CliConsole {
	logs: string[];
	warnings: string[];
	errors: string[];
}

function format(args: readonly unknown[], colors: boolean) {
	return util.formatWithOptions({ colors }, ...args);
}

export function createStreamingConsole(streams: CliStreams): CliConsole {
	const outColors = streams.stdout.isTTY === true;
	const errColors = streams.stderr.isTTY === true;
	const writeOut = (...args: unknown[]) => streams.stdout.write(`${format(args, outColors)}\n`);
	const writeErr = (...args: unknown[]) => streams.stderr.write(`${format(args, errColors)}\n`);
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
	const append = (bucket: string[]) => (...args: unknown[]) => bucket.push(format(args, false));
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
