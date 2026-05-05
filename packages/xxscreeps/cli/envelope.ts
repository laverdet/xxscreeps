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
		const fields = err as ThrownShape;
		return {
			message: typeof fields.message === 'string' ? fields.message : util.inspect(err, { colors: false }),
			name: typeof fields.name === 'string' ? fields.name : 'Error',
			stack: typeof fields.stack === 'string' ? fields.stack : '',
		};
	}
	return { message: String(err), name: 'Error', stack: '' };
}

export function buildEnvelope(outcome: EvalOutcome, sink: BufferedConsole): EvalEnvelope {
	const base: EvalEnvelopeBase = {
		errors: sink.errors,
		logs: sink.logs,
		warnings: sink.warnings,
	};
	return outcome.ok
		? { ...base, ok: true, result: wrapResult(outcome.result) }
		: { ...base, ok: false, thrown: describeThrown(outcome.thrown) };
}

export function serializeEnvelope(envelope: EvalEnvelope) {
	return JSON.stringify(envelope);
}
