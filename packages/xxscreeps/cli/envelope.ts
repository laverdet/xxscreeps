import type { BufferedConsole } from './console.js';
import * as util from 'node:util';

export interface EvalThrown {
	name: string;
	message: string;
	stack: string;
}

export interface EvalEnvelope {
	ok: boolean;
	result?: unknown;
	logs: string[];
	warnings: string[];
	errors: string[];
	thrown?: EvalThrown;
}

export type EvalOutcome =
	{ ok: true; result: unknown } |
	{ ok: false; thrown: unknown };

const nonJsonKey = '__nonJsonResult';

function jsonSerializable(value: unknown) {
	try {
		// JSON.stringify returns undefined for undefined/functions/symbols despite its
		// `string` return type; launder via `as unknown` so the check is honest.
		return JSON.stringify(value) as unknown !== undefined;
	} catch {
		return false;
	}
}

function wrapResult(value: unknown) {
	if (jsonSerializable(value)) {
		return value;
	}
	return { [nonJsonKey]: util.inspect(value, { colors: false }) };
}

// Cross-realm safe: errors thrown inside the curated vm.Context use that realm's `Error`
// constructor, so host-side `instanceof Error` returns false. Read the shape directly.
export function describeThrown(err: unknown): EvalThrown {
	if (typeof err === 'object' && err !== null) {
		const fields = err as { name?: unknown; message?: unknown; stack?: unknown };
		return {
			message: typeof fields.message === 'string' ? fields.message : util.inspect(err, { colors: false }),
			name: typeof fields.name === 'string' ? fields.name : 'Error',
			stack: typeof fields.stack === 'string' ? fields.stack : '',
		};
	}
	return { message: String(err), name: 'Error', stack: '' };
}

export function buildEnvelope(outcome: EvalOutcome, sink: BufferedConsole): EvalEnvelope {
	const envelope: EvalEnvelope = {
		errors: sink.errors,
		logs: sink.logs,
		ok: outcome.ok,
		warnings: sink.warnings,
	};
	if (outcome.ok) {
		envelope.result = wrapResult(outcome.result);
	} else {
		envelope.thrown = describeThrown(outcome.thrown);
	}
	return envelope;
}

export function serializeEnvelope(envelope: EvalEnvelope) {
	return JSON.stringify(envelope);
}
