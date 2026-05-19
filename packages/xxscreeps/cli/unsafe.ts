import { createRequire } from 'node:module';
import * as vm from 'node:vm';

const Acorn = createRequire(import.meta.url)('acorn') as typeof import('acorn');

const importModuleDynamically = (specifier: string) => import(specifier);

const isRecoverableSyntaxError = (error: unknown): error is SyntaxError =>
	error instanceof SyntaxError && error.message === 'Unexpected end of input';

interface UnsafeEvaluatorTarget {
	readonly context: vm.Context;
}

const globalTarget: UnsafeEvaluatorTarget = {
	context: vm.createContext(globalThis),
};

function parseSyncSource(source: string, target: UnsafeEvaluatorTarget) {
	// Parse plain for clear error messages
	// eslint-disable-next-line no-new
	new vm.Script(source);
	// Parse again w/ "use strict"
	const script = new vm.Script(`"use strict"; undefined; ${source}`, { importModuleDynamically });
	// eslint-disable-next-line @typescript-eslint/require-await
	return async (): Promise<unknown> => script.runInContext(target.context);
}

function parseAsyncSource(source: string, target: UnsafeEvaluatorTarget) {
	// `SourceTextModule` is parse-only here: it validates top-level await and rejects static imports.
	const module = function() {
		try {
			return new vm.SourceTextModule(source, { context: target.context, importModuleDynamically });
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
	// Expression form keeps the IIFE's completion value; statements fall through to the block form.
	try {
		const script = new vm.Script(`(async () => (${source}\n))()`, { importModuleDynamically });
		return async (): Promise<unknown> => script.runInContext(target.context) as Promise<unknown>;
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
	}
	// Block form: hoist top-level `let`/`const`/`var` out of the arrow so bindings survive the turn.
	const { hoisted, body } = hoistTopLevelDeclarations(source);
	const script = new vm.Script(
		`${hoisted}(async () => { ${body}\n })()`,
		{ importModuleDynamically },
	);
	return async (): Promise<unknown> => script.runInContext(target.context) as Promise<unknown>;
}

// Acorn's `.d.ts` only exports the base `Node`; estree shapes redeclared for the few we read.
interface AstNode {
	readonly type: string;
	readonly start: number;
	readonly end: number;
}
interface AstIdentifier extends AstNode {
	readonly type: 'Identifier';
	readonly name: string;
}
interface AstObjectPattern extends AstNode {
	readonly type: 'ObjectPattern';
	readonly properties: readonly AstObjectPart[];
}
interface AstObjectProperty extends AstNode {
	readonly type: 'Property';
	readonly value: AstPattern;
}
interface AstArrayPattern extends AstNode {
	readonly type: 'ArrayPattern';
	readonly elements: readonly (AstPattern | null)[];
}
interface AstRestElement extends AstNode {
	readonly type: 'RestElement';
	readonly argument: AstPattern;
}
interface AstAssignmentPattern extends AstNode {
	readonly type: 'AssignmentPattern';
	readonly left: AstPattern;
}
type AstPattern = AstIdentifier | AstObjectPattern | AstArrayPattern | AstRestElement | AstAssignmentPattern;
type AstObjectPart = AstObjectProperty | AstRestElement;
interface AstVariableDeclarator extends AstNode {
	readonly id: AstPattern;
	readonly init: AstNode | null;
}
interface AstVariableDeclaration extends AstNode {
	readonly type: 'VariableDeclaration';
	readonly declarations: readonly AstVariableDeclarator[];
}
interface AstProgram extends AstNode {
	readonly body: readonly AstNode[];
}

interface HoistedSource {
	readonly hoisted: string;
	readonly body: string;
}

interface SourceEdit {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

function isVariableDeclaration(node: AstNode): node is AstVariableDeclaration {
	return node.type === 'VariableDeclaration';
}

function hoistTopLevelDeclarations(source: string): HoistedSource {
	// Syntax errors fall through unmodified; `vm.Script` will surface v8's error.
	let root: AstProgram;
	try {
		root = Acorn.parse(source, {
			ecmaVersion: 'latest',
			sourceType: 'module',
			allowAwaitOutsideFunction: true,
			allowImportExportEverywhere: true,
		}) as unknown as AstProgram;
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
		return { hoisted: '', body: source };
	}
	const names: string[] = [];
	const edits: SourceEdit[] = [];
	for (const stmt of root.body) {
		if (!isVariableDeclaration(stmt)) continue;
		const assigns: string[] = [];
		for (const declarator of stmt.declarations) {
			collectBindings(declarator.id, names);
			if (declarator.init !== null) {
				const lhs = source.slice(declarator.id.start, declarator.id.end);
				const rhs = source.slice(declarator.init.start, declarator.init.end);
				// Parens prevent an `ObjectPattern` at statement start parsing as a block.
				assigns.push(`(${lhs} = ${rhs});`);
			}
		}
		edits.push({ start: stmt.start, end: stmt.end, text: assigns.join(' ') });
	}
	if (names.length === 0) return { hoisted: '', body: source };
	// Apply edits back-to-front so earlier-segment offsets stay valid.
	const sorted = [ ...edits ].sort((left, right) => right.start - left.start);
	let body = source;
	for (const edit of sorted) {
		body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
	}
	return { hoisted: `var ${names.join(', ')};\n`, body };
}

function collectBindings(node: AstPattern, out: string[]): void {
	switch (node.type) {
		case 'Identifier':
			out.push(node.name);
			break;
		case 'ObjectPattern':
			for (const prop of node.properties) {
				if (prop.type === 'RestElement') collectBindings(prop.argument, out);
				else collectBindings(prop.value, out);
			}
			break;
		case 'ArrayPattern':
			for (const elem of node.elements) {
				if (elem !== null) collectBindings(elem, out);
			}
			break;
		case 'RestElement':
			collectBindings(node.argument, out);
			break;
		case 'AssignmentPattern':
			collectBindings(node.left, out);
			break;
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
export function makeUnsafeEvaluator(source: string, target: UnsafeEvaluatorTarget = globalTarget) {
	try {
		return parseRecoverable(source, src => parseSyncSource(src, target));
	} catch {
		return parseRecoverable(source, src => parseAsyncSource(src, target));
	}
}

export const makeUnsafeGlobalEvaluator = (source: string) => makeUnsafeEvaluator(source);

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
