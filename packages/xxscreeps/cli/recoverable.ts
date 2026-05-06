import * as vm from 'node:vm';
import { wrapExpression } from './await-wrap.js';

// Bare-script parsing emits "Unexpected end of input" for incomplete blocks; the
// async wrap covers the same case behind a top-level `await`, which scripts reject.
export function recoverableSyntaxError(source: string): SyntaxError | undefined {
	for (const candidate of [ source, wrapExpression(source) ]) {
		try {
			// eslint-disable-next-line no-new
			new vm.Script(candidate);
			return undefined;
		} catch (err) {
			if (err instanceof SyntaxError && err.message === 'Unexpected end of input') {
				return err;
			}
		}
	}
	return undefined;
}
