import * as util from 'node:util';

export interface EvalThrown {
	name: string;
	message: string;
	stack: string;
}

// Handles thrown non-Errors and any future cross-realm `Error` whose `instanceof` would fail.
export function describeThrown(err: unknown): EvalThrown {
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
