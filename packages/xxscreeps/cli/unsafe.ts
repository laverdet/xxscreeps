import * as vm from 'node:vm';

const AsyncFunction =
	(async () => {}).constructor satisfies object as new (body: string) => () => Promise<unknown>;

const context = vm.createContext(globalThis);
const importModuleDynamically = (specifier: string) => import(specifier);

const isRecoverableSyntaxError = (error: unknown): error is SyntaxError =>
	error instanceof SyntaxError && error.message === 'Unexpected end of input';

function parseSyncSource(source: string) {
	// Parse plain for clear error messages
	// eslint-disable-next-line no-new
	new vm.Script(source);
	// Parse again w/ "use strict"
	const script = new vm.Script(`"use strict"; undefined; ${source}`, { importModuleDynamically });
	// eslint-disable-next-line @typescript-eslint/require-await
	return async (): Promise<unknown> => script.runInContext(context);
}

function parseAsyncSource(source: string) {
	// Parse plain source with `SourceTextModule`.
	const module = function() {
		try {
			return new vm.SourceTextModule(source, { context, importModuleDynamically });
		} catch (error) {
			// `SourceTextModule` throws foreign realm `SyntaxError` instances, I guess
			// @ts-expect-error
			if (error.name === 'SyntaxError') {
				// @ts-expect-error
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				throw new SyntaxError(error.message);
			} else {
				throw error;
			}
		}
	}();
	if (!module.hasTopLevelAwait()) {
		throw new SyntaxError('Expected `await`');
	} else if (module.moduleRequests.length !== 0) {
		throw new SyntaxError('Try dynamic `import()` instead.');
	}
	// `SourceTextModule` doesn't provide the "last" expression, for example `;1`, like `Script` does.
	// So `AsyncFunction` is used instead to fake it for single statements. The disadvantage is that
	// `;await 1` will not return the result without doing something crazy.
	try {
		return new AsyncFunction(`"use strict"; return ${source}`);
	} catch {
		return new AsyncFunction(`"use strict"; ${source}`);
	}
}

function parseRecoverable<Fn extends () => unknown>(
	source: string,
	make: (source: string) => Fn,
) {
	try {
		return make(source);
	} catch (error) {
		if (isRecoverableSyntaxError(error)) {
			return error;
		} else {
			throw error;
		}
	}
}

// Returns a `Function` (may be invoked) or `SyntaxError` (recoverable). Throws on unrecoverable
// syntax errors.
export function makeUnsafeGlobalEvaluator(source: string) {
	try {
		return parseRecoverable(source, parseSyncSource);
	} catch {
		return parseRecoverable(source, parseAsyncSource);
	}
}

// Evaluates the given source text and returns the "last" expression. Globals dump out into the
// current context.
export async function evaluateUnsafeGlobal(source: string): Promise<unknown> {
	const evaluator = makeUnsafeGlobalEvaluator(source);
	if (typeof evaluator === 'function') {
		return evaluator();
	} else {
		throw evaluator;
	}
}
