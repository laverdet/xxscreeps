import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as util from 'node:util';
import { evaluateUnsafeGlobal } from './unsafe.js';

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

interface EvalThrown {
	name: string;
	message: string;
	stack: string;
}

// Handles thrown non-Errors and any future cross-realm `Error` whose `instanceof` would fail.
function describeThrown(err: unknown): EvalThrown {
	if (typeof err === 'object' && err !== null) {
		const fields = err as Record<string, unknown>;
		return {
			message: typeof fields.message === 'string' ? fields.message : util.inspect(err, { colors: false }),
			name: typeof fields.name === 'string' ? fields.name : 'Error',
			stack: typeof fields.stack === 'string' ? fields.stack : '',
		};
	}
	return { message: String(err), name: 'Error', stack: '' };
}

interface RunEvalOptions {
	source: string;
	argv: readonly string[];
}

export async function runEval(options: RunEvalOptions): Promise<number> {
	try {
		using shared = shareGlobals(options.argv);
		console.log(await evaluateUnsafeGlobal(options.source));
		return 0;
	} catch (thrown) {
		const described = describeThrown(thrown);
		const message = described.stack === '' ? `${described.name}: ${described.message}` : described.stack;
		console.error(message);
		return 1;
	}
}
