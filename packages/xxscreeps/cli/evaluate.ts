import type { CliStreams } from './console.js';
import * as util from 'node:util';
import * as vm from 'node:vm';
import { createBufferedConsole, createStreamingConsole } from './console.js';
import { createCuratedContext } from './context.js';
import { buildEnvelope, describeThrown, serializeEnvelope } from './envelope.js';

// Compilation candidates: raw source, async-wrapped expression, async-wrapped block.
// The expression form supports `await foo()`, the block form supports statements with
// top-level `await`, and falling through covers `var x = 1` and similar declarations.
function asyncEvalCandidates(source: string): readonly [string, string, string] {
	return [
		source,
		`(async()=>(${source}\n))()`,
		`(async()=>{${source}\n})()`,
	];
}

function compileScript(source: string, filename: string) {
	return new vm.Script(source, { filename });
}

export function recoverableSyntaxError(source: string): SyntaxError | undefined {
	for (const candidate of asyncEvalCandidates(source)) {
		try {
			compileScript(candidate, 'cli');
			return undefined;
		} catch (err) {
			if (!(err instanceof SyntaxError)) {
				throw err;
			}
			if (err.message === 'Unexpected end of input') {
				return err;
			}
		}
	}
	return undefined;
}

// Pre-compile in the host realm so SyntaxError reliably matches `instanceof SyntaxError`;
// `vm.runInContext` would compile inside the context's realm, where the thrown error is a
// different SyntaxError constructor and cross-realm `instanceof` is false. Runtime errors
// from `script.runInContext` happen inside the curated realm and propagate as user errors.
export async function evaluateInContext(context: vm.Context, source: string, filename = 'cli'): Promise<unknown> {
	const [ raw, asExpression, asBlock ] = asyncEvalCandidates(source);
	for (const candidate of [ raw, asExpression ]) {
		let script: vm.Script;
		try {
			script = compileScript(candidate, filename);
		} catch (err) {
			if (err instanceof SyntaxError) {
				continue;
			}
			throw err;
		}
		return await script.runInContext(context) as unknown;
	}
	return await compileScript(asBlock, filename).runInContext(context) as unknown;
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
		const context = createCuratedContext({ argv: options.argv, console: sink });
		try {
			const result = await evaluateInContext(context, options.source, 'eval');
			options.streams.stdout.write(`${serializeEnvelope(buildEnvelope({ ok: true, result }, sink))}\n`);
			return 0;
		} catch (thrown) {
			options.streams.stdout.write(`${serializeEnvelope(buildEnvelope({ ok: false, thrown }, sink))}\n`);
			return 1;
		}
	}
	const sink = createStreamingConsole(options.streams);
	const context = createCuratedContext({ argv: options.argv, console: sink });
	try {
		const result = await evaluateInContext(context, options.source, 'eval');
		options.streams.stdout.write(`${util.inspect(result, { colors: false })}\n`);
		return 0;
	} catch (thrown) {
		const described = describeThrown(thrown);
		const message = described.stack === '' ? `${described.name}: ${described.message}` : described.stack;
		options.streams.stderr.write(`${message}\n`);
		return 1;
	}
}
