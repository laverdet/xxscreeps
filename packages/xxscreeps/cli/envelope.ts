import type { BufferedConsole } from './console.js';
import * as util from 'node:util';

interface ThrownShape {
	name?: unknown;
	message?: unknown;
	stack?: unknown;
}

export interface EvalThrown {
	name: string;
	message: string;
	stack: string;
}

interface EvalEnvelopeBase {
	logs: string[];
	warnings: string[];
	errors: string[];
}

export interface EvalEnvelopeOk extends EvalEnvelopeBase {
	ok: true;
	result: unknown;
}

export interface EvalEnvelopeErr extends EvalEnvelopeBase {
	ok: false;
	thrown: EvalThrown;
}

export type EvalEnvelope = EvalEnvelopeOk | EvalEnvelopeErr;

export type EvalOutcome =
	{ ok: true; result: unknown } |
	{ ok: false; thrown: unknown };

// Handles thrown non-Errors and any future cross-realm `Error` whose `instanceof` would fail.
export function describeThrown(err: unknown): EvalThrown {
	if (typeof err === 'object' && err !== null) {
		const fields = err as ThrownShape;
		return {
			message: typeof fields.message === 'string' ? fields.message : util.inspect(err, { colors: false }),
			name: typeof fields.name === 'string' ? fields.name : 'Error',
			stack: typeof fields.stack === 'string' ? fields.stack : '',
		};
	}
	return { message: String(err), name: 'Error', stack: '' };
}

export function serializeEnvelope(outcome: EvalOutcome, sink: BufferedConsole): string {
	const base: EvalEnvelopeBase = {
		errors: sink.errors,
		logs: sink.logs,
		warnings: sink.warnings,
	};
	if (!outcome.ok) {
		return JSON.stringify({ ...base, ok: false, thrown: describeThrown(outcome.thrown) });
	}
	const { result } = outcome;
	// `undefined`/function/symbol drop silently and BigInt throws; substitute to keep `result` present.
	if (typeof result !== 'undefined' && typeof result !== 'function' && typeof result !== 'symbol') {
		try {
			return JSON.stringify({ ...base, ok: true, result });
		} catch {}
	}
	return JSON.stringify({
		...base, ok: true,
		result: { __nonJsonResult: util.inspect(result, { colors: false }) },
	});
}
