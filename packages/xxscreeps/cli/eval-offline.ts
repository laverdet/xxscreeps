import { createRequire } from 'node:module';
import * as path from 'node:path';
import { wrapBlock, wrapExpression } from './await-wrap.js';
import { describeThrown } from './envelope.js';

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

function shareGlobals(argv: readonly string[]) {
	installHostShims();
	const globals = globalThis as Record<string, unknown>;
	const previousConsole = globals.console;
	const hadArgv = 'argv' in globals;
	const previousArgv = globals.argv;
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
	argv: readonly string[];
}

export async function runEval(options: RunEvalOptions): Promise<number> {
	try {
		using shared = shareGlobals(options.argv);
		console.log(await evaluateOffline(options.source));
		return 0;
	} catch (thrown) {
		const described = describeThrown(thrown);
		const message = described.stack === '' ? `${described.name}: ${described.message}` : described.stack;
		console.error(message);
		return 1;
	}
}
