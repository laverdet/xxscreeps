import type { CliConsole, CliStreams } from './console.js';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as util from 'node:util';
import { wrapBlock, wrapExpression } from './await-wrap.js';
import { createBufferedConsole, createStreamingConsole } from './console.js';
import { describeThrown, serializeEnvelope } from './envelope.js';

const asyncProto = Object.getPrototypeOf(async () => {}) as {
	constructor: new (body: string) => () => Promise<unknown>;
};
const AsyncFunction = asyncProto.constructor;

// Indirect eval gives completion-value + globalThis-var semantics. Parse-check via
// the Function constructor before invoking so a runtime SyntaxError from
// already-running source (e.g. `JSON.parse("}")`) can't trigger a re-execute, and
// so script-mode lexer quirks (`(await x)` reports "Unexpected identifier" because
// `await` lexes as identifier) don't fool a message-substring filter.
export async function evaluateOffline(source: string): Promise<unknown> {
	let parses = true;
	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
		Function(source);
	} catch (err) {
		if (!(err instanceof SyntaxError)) throw err;
		parses = false;
	}
	if (parses) {
		// eslint-disable-next-line no-eval
		return (0, eval)(source) as unknown;
	}
	let fn: () => Promise<unknown>;
	try {
		fn = new AsyncFunction(`return ${wrapExpression(source)}`);
	} catch (err) {
		if (!(err instanceof SyntaxError)) throw err;
		fn = new AsyncFunction(`return ${wrapBlock(source)}`);
	}
	return fn();
}

export function installHostShims(): void {
	const globals = globalThis as Record<string, unknown>;
	const cwd = process.cwd();
	const syntheticFile = path.join(cwd, '[eval]');
	globals.require ??= createRequire(syntheticFile);
	globals.__filename ??= syntheticFile;
	globals.__dirname ??= cwd;
}

function shareGlobals(cliConsole: CliConsole, argv: readonly string[]) {
	installHostShims();
	const globals = globalThis as Record<string, unknown>;
	const previousConsole = globals.console;
	const hadArgv = 'argv' in globals;
	const previousArgv = globals.argv;
	globals.console = cliConsole;
	globals.argv = [ ...argv ];
	return {
		[Symbol.dispose]() {
			globals.console = previousConsole;
			if (hadArgv) {
				globals.argv = previousArgv;
			} else {
				delete globals.argv;
			}
		},
	};
}

export interface RunEvalOptions {
	source: string;
	json: boolean;
	argv: readonly string[];
	streams: CliStreams;
}

export async function runEval(options: RunEvalOptions): Promise<number> {
	if (options.json) {
		const sink = createBufferedConsole();
		try {
			using shared = shareGlobals(sink, options.argv);
			const result = await evaluateOffline(options.source);
			options.streams.stdout.write(`${serializeEnvelope({ ok: true, result }, sink)}\n`);
			return 0;
		} catch (thrown) {
			options.streams.stdout.write(`${serializeEnvelope({ ok: false, thrown }, sink)}\n`);
			return 1;
		}
	}
	const sink = createStreamingConsole(options.streams);
	try {
		using shared = shareGlobals(sink, options.argv);
		const result = await evaluateOffline(options.source);
		options.streams.stdout.write(`${util.inspect(result, { colors: false })}\n`);
		return 0;
	} catch (thrown) {
		const described = describeThrown(thrown);
		const message = described.stack === '' ? `${described.name}: ${described.message}` : described.stack;
		options.streams.stderr.write(`${message}\n`);
		return 1;
	}
}
