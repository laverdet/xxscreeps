import type { FileSystemAsync } from '@loaderkit/resolve/fs';
import type { JSDocTagInfo, SymbolDisplayPart } from 'typescript';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from '@loaderkit/resolve/esm';
import { defaultAsyncFileSystem } from '@loaderkit/resolve/fs';
import ts from 'typescript';
import { checkArguments } from 'xxscreeps/config/arguments.js';
import { makeModTypeScriptText } from 'xxscreeps/config/loader.js';
import { mods } from 'xxscreeps/config/mods.js';
import { primitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { identity } from 'xxscreeps/functional/functional.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import { urlAsDirectory } from 'xxscreeps/utility/url.js';

// Generate a `screeps.d.ts` file based on the configured mods. We instantiate an in-memory
// TypeScript program with replaced ambient modules selected from the mod manifest. Any docblock
// declared with `@public` is emitted. Special care is given to `withOverlay` mixins to extract
// docblocks from schema types into the concrete game type.

const argv = checkArguments({ string: [ 'out' ] });
const cwd = urlAsDirectory(pathToFileURL(process.cwd()));
const outFile = argv.out === undefined
	? new URL('screeps.d.ts', cwd)
	: pathToFileURL(path.join(process.cwd(), argv.out));

// Locate the npm module contributing to each mod, by the mod's `type.name` manifest field.
const packages = await async function() {
	// File system which injects package.json exports declaration. This allows resolving the root
	// package.json file.
	const packageJsonFileSystem: FileSystemAsync = {
		...defaultAsyncFileSystem,
		async readFileJSON(path) {
			const json = await defaultAsyncFileSystem.readFileJSON(path) as Record<string, unknown>;
			return {
				...json,
				exports: {
					...json.exports as Record<string, unknown> | undefined,
					'./package.json': './package.json',
				},
			};
		},
	};
	return new Map(await Fn.mapAwait(
		Fn.pipe(
			mods,
			$$ => Fn.map($$, mod => mod.types),
			$$ => Fn.filter($$),
			$$ => Fn.map($$, types => [ types.name, types ] as const),
			$$ => new Map($$).values()),
		async ({ js, name, ts }) => {
			const { url } = await resolve(packageJsonFileSystem, `${name}/package.json`, cwd);
			const root = urlAsDirectory(new URL('.', url));
			return [ name, { dist: js, root, source: ts } ] as const;
		}));
}();

// Compiler options for the virtual program.
const compilerOptions: ts.CompilerOptions = {
	noEmit: true,
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	lib: [ 'lib.esnext.d.ts' ],
	paths: Fn.pipe(
		packages,
		$$ => Fn.map($$, ([ name, { source } ]) => {
			const key = `${name}/*`;
			const paths = [ `${source.pathname}*` ];
			return [ key, paths ] as const;
		}),
		$$ => Fn.fromEntries($$)),
	verbatimModuleSyntax: true,
	exactOptionalPropertyTypes: true,
	isolatedModules: true,
	skipLibCheck: true,
	strict: true,
};

// In-memory files generated from active mod list.
const xxpackage = packages.get('xxscreeps');
assert.ok(xxpackage);
const virtualFiles = Fn.pipe(
	Object.entries({
		'main.ts': 'import "xxscreeps/game/index.js";',
		'constants.d.ts': makeModTypeScriptText(mods, 'constants'),
		'game.d.ts': makeModTypeScriptText(mods, 'game'),
	}),
	$$ => Fn.map($$, ([ name, text ]) => [ fileURLToPath(new URL(name, xxpackage.root)), text ] as const),
	$$ => new Map($$));

// Ambient '.d.ts' declarations under each package's root.
const declarationFiles =
	Fn.pipe(
		await Fn.mapAwait(packages.values(), async ({ dist, root }) =>
			Fn.pipe(
				await fs.readdir(root, { recursive: true }),
				$$ => Fn.map($$, file => new URL(file, root)),
				$$ => Fn.reject($$, file => file.href.startsWith(dist.href) || file.href.includes('/node_modules/')),
				$$ => Fn.filter($$, file => file.href.endsWith('.d.ts')),
				// Ignore built-in comprehensive constants declaration
				$$ => Fn.reject($$, file => file.href.endsWith('config/declarations/constants.d.ts')),
				$$ => Fn.map($$, file => file.href),
				$$ => [ ...$$ ].sort(primitiveComparator)),
		),
		$$ => Fn.transform($$, hrefs => Fn.map(hrefs, href => fileURLToPath(href))),
		$$ => [ ...$$ ]);

// Create virtual file compiler host on top of default host
const host = ts.createCompilerHost(compilerOptions);
host.fileExists = Fn.chainLogicalOr1(fileName => virtualFiles.has(fileName), host.fileExists.bind(host));
host.readFile = Fn.chainNullishCoalesce1(fileName => virtualFiles.get(fileName), host.readFile.bind(host));
host.realpath = function() {
	const realpath = host.realpath?.bind(host);
	const virtualRealPath = (fileName: string) => virtualFiles.has(fileName) ? fileName : undefined as never;
	return Fn.fold([ virtualRealPath, realpath, identity ], undefined, (left, right) => Fn.chain(left, right, Fn.chainNullishCoalesce1))!;
}();
host.getSourceFile = function() {
	const getSourceFile = host.getSourceFile.bind(host);
	return (fileName, languageVersion, ...rest) => {
		const text = virtualFiles.get(pathToFileURL(fileName).href);
		if (text !== undefined) {
			return ts.createSourceFile(fileName, text, languageVersion);
		}
		return getSourceFile(fileName, languageVersion, ...rest);
	};
}();

// Instantiate TypeScript program
const program = ts.createProgram({
	rootNames: [
		...virtualFiles.keys(),
		...declarationFiles,
	],
	options: compilerOptions,
	host,
});
const checker = program.getTypeChecker();
const unresolved = Fn.take(Fn.filter(program.getSemanticDiagnostics(), diagnostic => diagnostic.code === 2307), 10);
for (const diagnostic of unresolved) {
	console.error(`warning: unresolved module: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
}

//
// The Claude zone follows:

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const builderFlags =
	ts.NodeBuilderFlags.NoTruncation |
	ts.NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
	ts.NodeBuilderFlags.IgnoreErrors;

const dealias = (symbol: ts.Symbol) => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

// Resolve import aliases and declaration-merge shells to the canonical symbol. `getSymbolsInScope`
// can return pre-merge symbols with no flags, and `getSymbolAtLocation` on a declaration name
// misses cross-module augmentations (e.g. a mod's `declare module` interface merged onto a class);
// `getExportSymbolOfSymbol` resolves to the fully-merged symbol.
function canonical(symbol: ts.Symbol) {
	const direct = dealias(symbol);
	const resolved = function() {
		const decl = direct.declarations?.[0];
		const name = decl && ts.getNameOfDeclaration(decl);
		if (name && ts.isIdentifier(name)) {
			const symbol = checker.getSymbolAtLocation(name);
			if (symbol) {
				return dealias(symbol);
			}
		}
		return direct;
	}();
	return checker.getExportSymbolOfSymbol(resolved);
}

// Our files are the workspace packages -- which cover the virtual entry modules and workspace
// dependencies like `@xxscreeps/pathfinder` alike -- plus foreign `@xxscreeps/*` packages under
// their `node_modules` paths.
const packagesRoot = new URL('..', xxpackage.root).pathname;
const isOursFile = (fileName: string) =>
	(fileName.startsWith(packagesRoot) && !fileName.includes('/node_modules/')) ||
	/\/node_modules\/(\.pnpm\/)?@xxscreeps[+/]/.test(fileName);
const isOurs = (symbol: ts.Symbol) => Boolean(symbol.declarations?.some(decl => isOursFile(decl.getSourceFile().fileName)));

// Types from dependency packages (e.g. isolated-vm) referenced by the public API are emitted too,
// as long as they don't come from the TypeScript/node standard libraries.
function isForeignEmittable(symbol: ts.Symbol) {
	return Boolean(symbol.declarations?.every(decl => {
		const sourceFile = decl.getSourceFile();
		return sourceFile.fileName.includes('/node_modules/') &&
			!program.isSourceFileDefaultLibrary(sourceFile) &&
			!sourceFile.fileName.includes('/node_modules/typescript/') &&
			!sourceFile.fileName.includes('/node_modules/@types/');
	}));
}

// ---------------------------------------------------------------------------------------------
// Registry of scheduled emissions. A symbol can be emitted on its type side ('type': interface or
// type alias), its static side ('constructor': `interface FooConstructor`), or as a value
// ('const': `declare const`). Emissions carry the output section they belong to; within one
// section declarations keep discovery order.

type EmitKind = 'type' | 'constructor' | 'const';
const sections = [ 'Utilities', 'Constant types', 'Constants', 'Constructors & objects', 'Globals' ] as const;
type Section = typeof sections[number];
const symbolNames = new Map<ts.Symbol, string>();
const namesTaken = new Map<string, ts.Symbol>();
const scheduled = new Map<ts.Symbol, Set<EmitKind>>();
const queue: { symbol: ts.Symbol; kind: EmitKind; name: string }[] = [];
const emitted = new Map<string, { section: Section; text: string }[]>();

function nameFor(symbol: ts.Symbol) {
	const existing = symbolNames.get(symbol);
	if (existing !== undefined) {
		return existing;
	}
	const name = function() {
		if (!namesTaken.has(symbol.name)) {
			return symbol.name;
		}
		const unique = Fn.find(
			Fn.map(Fn.range(2, Infinity), counter => `${symbol.name}_${counter}`),
			candidate => !namesTaken.has(candidate))!;
		console.error(`warning: name collision; '${symbol.name}' emitted as '${unique}'`);
		return unique;
	}();
	symbolNames.set(symbol, name);
	namesTaken.set(name, symbol);
	return name;
}

function schedule(target: ts.Symbol, kind: EmitKind) {
	const symbol = dealias(target);
	const name = kind === 'constructor' ? `${nameFor(symbol)}Constructor` : nameFor(symbol);
	const kinds = scheduled.get(symbol) ?? new Set();
	if (!kinds.has(kind)) {
		kinds.add(kind);
		scheduled.set(symbol, kinds);
		queue.push({ symbol, kind, name });
	}
	return name;
}

// ---------------------------------------------------------------------------------------------
// Symbol resolution for printed type nodes

const scopeCache = new Map<ts.Node, Map<string, ts.Symbol>>();
function symbolsInScope(enclosing: ts.Node) {
	return scopeCache.get(enclosing) ?? function() {
		const map = new Map<string, ts.Symbol>();
		const meaning = ts.SymbolFlags.Type | ts.SymbolFlags.Namespace | ts.SymbolFlags.Value | ts.SymbolFlags.Alias;
		for (const symbol of checker.getSymbolsInScope(enclosing, meaning)) {
			if (!map.has(symbol.name)) {
				map.set(symbol.name, symbol);
			}
		}
		scopeCache.set(enclosing, map);
		return map;
	}();
}

// Top-level statements of every one of our source files
const ourStatements = () => Fn.transform(
	Fn.filter(program.getSourceFiles(), sourceFile => isOursFile(sourceFile.fileName)),
	sourceFile => sourceFile.statements);

// Name identifiers of the type declarations in a statement, recursing into module blocks
function *declaredTypeNames(statement: ts.Statement): Iterable<ts.Identifier> {
	if (
		(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
			ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name
	) {
		yield statement.name;
	} else if (ts.isModuleDeclaration(statement) && statement.body && ts.isModuleBlock(statement.body)) {
		yield* Fn.transform(statement.body.statements, statement => declaredTypeNames(statement));
	}
}

// Fallback index: every top-level type declaration in our source files, including non-exported
// ones, which the node builder may reference by bare name from files where they aren't in scope.
const typeIndex = new Map<string, ts.Symbol>();
for (const name of Fn.transform(ourStatements(), statement => declaredTypeNames(statement))) {
	const symbol = checker.getSymbolAtLocation(name);
	if (symbol && !typeIndex.has(name.text)) {
		typeIndex.set(name.text, canonical(symbol));
	}
}

function exportsOf(symbol: ts.Symbol): readonly ts.Symbol[] {
	if (symbol.flags & ts.SymbolFlags.Module) {
		return checker.getExportsOfModule(symbol);
	}
	return [ ...symbol.exports?.values() ?? [] ];
}

// Returns the canonical symbol an EntityName (`A` or `A.B.C`) refers to, or undefined
function resolveEntityName(entityName: ts.EntityName, enclosing: ts.Node): ts.Symbol | undefined {
	if (ts.isIdentifier(entityName)) {
		const symbol = symbolsInScope(enclosing).get(entityName.text) ?? typeIndex.get(entityName.text);
		return symbol && canonical(symbol);
	}
	const left = resolveEntityName(entityName.left, enclosing);
	if (!left) {
		return undefined;
	}
	const symbol = exportsOf(left).find(symbol => symbol.name === entityName.right.text) ??
		left.members?.get(entityName.right.escapedText);
	return symbol && canonical(symbol);
}

// Resolve a synthesized expression chain like `C.FIND_MY_STRUCTURES` to a symbol
function resolveExpressionChain(expression: ts.Expression, enclosing: ts.Node) {
	const resolve = (expression: ts.Expression): ts.Symbol | undefined => {
		if (ts.isIdentifier(expression)) {
			return symbolsInScope(enclosing).get(expression.text);
		} else if (ts.isPropertyAccessExpression(expression)) {
			const left = resolve(expression.expression);
			return left && exportsOf(dealias(left)).find(symbol => symbol.name === expression.name.text);
		}
		return undefined;
	};
	const symbol = resolve(expression);
	return symbol && canonical(symbol);
}

// `A.B.C` -> [ 'A', 'B', 'C' ]
const entityNameParts = (name: ts.EntityName): string[] =>
	ts.isQualifiedName(name) ? [ ...entityNameParts(name.left), name.right.text ] : [ name.text ];

// import("specifier").A.B -> symbol
function resolveImportTypeSymbol(node: ts.ImportTypeNode, enclosing: ts.Node) {
	if (!node.qualifier || !ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) {
		return undefined;
	}
	const resolvedModule = ts.resolveModuleName(node.argument.literal.text, enclosing.getSourceFile().fileName, compilerOptions, host).resolvedModule;
	const sourceFile = resolvedModule && program.getSourceFile(resolvedModule.resolvedFileName);
	const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
	if (!moduleSymbol) {
		return undefined;
	}
	return Fn.reduce<string, ts.Symbol | undefined>(
		entityNameParts(node.qualifier),
		moduleSymbol,
		(symbol, name) => {
			const next = symbol && exportsOf(symbol).find(symbol => symbol.name === name);
			return next && canonical(next);
		});
}

// Schedule a symbol found in a printed type position; returns replacement name or undefined
function scheduleTypeSymbol(symbol: ts.Symbol | undefined) {
	if (!symbol || symbol.flags & ts.SymbolFlags.TypeParameter) {
		return undefined;
	}
	if (!isOurs(symbol) && !isForeignEmittable(symbol)) {
		return undefined;
	}
	if (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) {
		return schedule(symbol, 'type');
	}
	return undefined;
}

// Render the key for a property declared with a computed constant name (`[C.PWR_GENERATE_OPS]`).
// Branded constants are all emitted, so such a key references the constant by bare name; any
// other constant decays to its literal value.
function constantKeyName(symbol: ts.Symbol): ts.PropertyName | undefined {
	if (isOurs(symbol) && symbol.flags & ts.SymbolFlags.Variable && brandOfType(checker.getTypeOfSymbol(symbol))) {
		return ts.factory.createComputedPropertyName(ts.factory.createIdentifier(schedule(symbol, 'const')));
	}
	const type = literalOfType(checker.getTypeOfSymbol(symbol));
	if (type && type.flags & ts.TypeFlags.NumberLiteral) {
		return ts.factory.createNumericLiteral((type as ts.NumberLiteralType).value);
	} else if (type) {
		return ts.factory.createStringLiteral((type as ts.StringLiteralType).value);
	}
	return undefined;
}

// Schedule a symbol found in a `typeof X` position; returns replacement TypeNode or undefined
function scheduleValueSymbol(symbol: ts.Symbol | undefined): ts.TypeNode | undefined {
	if (!symbol || !isOurs(symbol)) {
		return undefined;
	}
	if (symbol.flags & ts.SymbolFlags.Class) {
		return ts.factory.createTypeReferenceNode(schedule(symbol, 'constructor'));
	}
	if (symbol.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Function)) {
		const name = schedule(symbol, 'const');
		// Branded constants emit a same-named type alias (see `emitConst`); reference it directly
		if (symbol.flags & ts.SymbolFlags.Variable && brandOfType(checker.getTypeOfSymbol(symbol))) {
			return ts.factory.createTypeReferenceNode(name);
		}
		return ts.factory.createTypeQueryNode(ts.factory.createIdentifier(name));
	}
	return undefined;
}

// ---------------------------------------------------------------------------------------------
// TypeNode post-processing: rewrite `import(...)` wrappers and qualified names into bare
// references to declarations this file will also emit, scheduling them along the way.

// The node builder carries JSDoc on synthesized type-literal members by pointing the printer at
// the original declaration's comment range, copying the source docblock verbatim -- bypassing
// `renderDocs` and its `@public` filtering. Detach the range, then re-attach only the `@public`
// docblocks synthetically with the marker line filtered out; anything untagged is internal.
function stripPublicTag(node: ts.Node) {
	const range = ts.getCommentRange(node);
	if (range === node || !('getSourceFile' in range)) {
		return;
	}
	const text = (range as ts.Node).getSourceFile().text;
	const comments = (ts.getLeadingCommentRanges(text, range.pos) ?? [])
		.filter(comment => text.slice(comment.pos, comment.end).includes('@public'));
	ts.setCommentRange(node, { pos: -1, end: -1 });
	if (comments.length === 0) {
		return;
	}
	ts.setSyntheticLeadingComments(node, [
		...ts.getSyntheticLeadingComments(node) ?? [],
		...comments.map((comment): ts.SynthesizedComment => {
			const multiLine = comment.kind === ts.SyntaxKind.MultiLineCommentTrivia;
			const body = text.slice(comment.pos + 2, comment.end - (multiLine ? 2 : 0));
			const rebuilt = function() {
				if (!multiLine || !body.startsWith('*')) {
					return body;
				}
				const lines = Fn.pipe(
					body.split('\n'),
					$$ => Fn.slice($$, 1),
					$$ => Fn.map($$, line => line.replace(/^\s*\*? ?/, '').trimEnd()),
					$$ => Fn.reject($$, line => /^@public\s*$/.test(line)),
					$$ => [ ...$$ ]);
				// Trailing blank lines left behind by the removed tag are dropped
				const kept = Fn.slice(lines, 0, lines.findLastIndex(line => line !== '') + 1);
				return `*\n${Fn.join(Fn.map(kept, line => ` * ${line}`.trimEnd()), '\n')}\n `;
			}();
			return {
				kind: comment.kind,
				text: rebuilt,
				pos: -1,
				end: -1,
				hasTrailingNewLine: comment.hasTrailingNewLine ?? true,
				hasLeadingNewline: true,
			};
		}),
	]);
}

function cleanTypeNode<Type extends ts.Node>(node: Type, enclosing: ts.Node): Type {
	const transformer: ts.TransformerFactory<ts.Node> = context => rootNode => {
		const visitType = (node: ts.TypeNode): ts.TypeNode => ts.visitNode(node, visit, ts.isTypeNode) ?? node;
		const visit = (node: ts.Node): ts.Node | undefined => {
			stripPublicTag(node);
			if (ts.isPropertySignature(node) && ts.isComputedPropertyName(node.name)) {
				// Computed keys (e.g. `[C.FIND_MY_STRUCTURES]`) can't reference module values in the
				// output. Branded constants are referenced by their emitted name, anything else
				// resolves to a literal key, and the member is dropped if the constant isn't part of
				// the active mod set.
				const symbol = resolveExpressionChain(node.name.expression, enclosing);
				const visitedType = node.type && visitType(node.type);
				const name = symbol && constantKeyName(symbol);
				if (name) {
					return ts.factory.updatePropertySignature(node, node.modifiers, name, node.questionToken, visitedType);
				}
				console.error('warning: dropped computed key which does not resolve in the active mod set');
				return undefined;
			}
			if (ts.isImportTypeNode(node)) {
				const symbol = resolveImportTypeSymbol(node, enclosing);
				const typeArguments = node.typeArguments?.map(visitType);
				if (symbol) {
					if (node.isTypeOf) {
						const replacement = scheduleValueSymbol(symbol);
						if (replacement) {
							return replacement;
						}
					} else {
						const name = scheduleTypeSymbol(symbol);
						if (name !== undefined) {
							return ts.factory.createTypeReferenceNode(name, typeArguments);
						}
					}
				}
				const fallback = node.qualifier
					? ts.isQualifiedName(node.qualifier) ? node.qualifier.right.text : node.qualifier.text : 'never';
				console.error(`warning: could not resolve import() type; emitted bare '${fallback}'`);
				return ts.factory.createTypeReferenceNode(fallback, typeArguments);
			}
			if (
				ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'ReturnType' &&
				node.typeArguments?.length === 1 && ts.isTypeQueryNode(node.typeArguments[0]!)
			) {
				// `ReturnType<typeof checkIntent>` is a common idiom in mod augmentations; inline the
				// resolved return type rather than dragging the internal function into the output
				const query: ts.TypeQueryNode = node.typeArguments[0];
				const symbol = resolveEntityName(query.exprName, enclosing);
				const signatures = symbol && isOurs(symbol) && symbol.flags & ts.SymbolFlags.Function
					? checker.getTypeOfSymbol(symbol).getCallSignatures() : [];
				if (signatures.length === 1) {
					const returnNode = checker.typeToTypeNode(signatures[0]!.getReturnType(), enclosing, builderFlags);
					if (returnNode) {
						return ts.visitNode(returnNode, visit) ?? returnNode;
					}
				}
			}
			if (ts.isTypeReferenceNode(node)) {
				const symbol = resolveEntityName(node.typeName, enclosing);
				const typeArguments = node.typeArguments?.map(visitType);
				const name = scheduleTypeSymbol(symbol);
				if (name !== undefined) {
					return ts.factory.createTypeReferenceNode(name, typeArguments);
				}
				if (ts.isQualifiedName(node.typeName)) {
					// Unscheduled qualified name (e.g. from the standard library): keep the rightmost part
					return ts.factory.createTypeReferenceNode(node.typeName.right.text, typeArguments);
				}
				return ts.factory.updateTypeReferenceNode(node, node.typeName, typeArguments && ts.factory.createNodeArray(typeArguments));
			}
			if (ts.isTypeQueryNode(node)) {
				const symbol = resolveEntityName(node.exprName, enclosing);
				const replacement = scheduleValueSymbol(symbol);
				if (replacement) {
					return replacement;
				}
				if (ts.isQualifiedName(node.exprName)) {
					return ts.factory.createTypeQueryNode(ts.factory.createIdentifier(node.exprName.right.text));
				}
				return node;
			}
			if (ts.isUnionTypeNode(node)) {
				const folded = foldBrandedUnion(node, visitType);
				if (folded) {
					return folded;
				}
			}
			if (ts.isIntersectionTypeNode(node)) {
				// A lone branded literal strips to its literal: `declare const TOP: 1`
				const branded = brandedLiteralNode(node);
				if (branded) {
					return branded.literal;
				}
			}
			if (ts.isParenthesizedTypeNode(node)) {
				// Unwrap parentheses left behind when a folded union no longer needs them
				const inner = visitType(node.type);
				return ts.isTypeReferenceNode(inner) ? inner : ts.factory.updateParenthesizedType(node, inner);
			}
			return ts.visitEachChild(node, visit, context);
		};
		return visit(rootNode)!;
	};
	return ts.transform(node, [ transformer ]).transformed[0] as Type;
}

// The node builder decomposes branded constants used as computed keys (`[PWR_GENERATE_OPS]:`)
// into their literal values. Follow each member of a printed type literal back to its declaration
// and restore the constant reference behind its computed name.
function restoreBrandedKeys(node: ts.TypeNode, type: ts.Type): ts.TypeNode {
	if (!ts.isTypeLiteralNode(node)) {
		return node;
	}
	const members = node.members.map(member => {
		if (
			!ts.isPropertySignature(member) || !member.type ||
			!(ts.isNumericLiteral(member.name) || ts.isStringLiteral(member.name) || ts.isIdentifier(member.name))
		) {
			return member;
		}
		const prop = type.getProperty(member.name.text);
		const decl = prop?.valueDeclaration;
		if (!prop || !decl) {
			return member;
		}
		const restoredType = restoreBrandedKeys(member.type, checker.getTypeOfSymbol(prop));
		const name = function() {
			const declName = ts.getNameOfDeclaration(decl);
			if (declName && ts.isComputedPropertyName(declName)) {
				const symbol = checker.getSymbolAtLocation(declName.expression);
				const keyName = symbol && constantKeyName(canonical(symbol));
				// Only an upgrade to a constant reference is interesting; a literal is already in place
				if (keyName && ts.isComputedPropertyName(keyName)) {
					return keyName;
				}
			}
			return member.name;
		}();
		if (name === member.name && restoredType === member.type) {
			return member;
		}
		return ts.factory.updatePropertySignature(member, member.modifiers, name, member.questionToken, restoredType);
	});
	return members.every((member, ii) => member === node.members[ii])
		? node
		: ts.factory.updateTypeLiteralNode(node, ts.factory.createNodeArray(members));
}

// Indent continuation lines of multi-line printed types so they nest under the member
const reindent = (text: string, indent: string) => text.replace(/\n/g, `\n${indent}`);

function printNode(node: ts.Node, enclosing: ts.Node, indent = '') {
	// The printer indents with four spaces; the rest of this file indents with tabs
	const text = printer.printNode(ts.EmitHint.Unspecified, node, enclosing.getSourceFile())
		.replace(/^(?: {4})+/gm, spaces => '\t'.repeat(spaces.length / 4));
	return reindent(text, indent);
}

function printTypeNode(type: ts.Type, enclosing: ts.Node, extraFlags: ts.NodeBuilderFlags = 0, indent = '') {
	const node = checker.typeToTypeNode(type, enclosing, builderFlags | extraFlags);
	if (!node) {
		return 'unknown';
	}
	return printNode(restoreBrandedKeys(cleanTypeNode(node, enclosing), type), enclosing, indent);
}

// ---------------------------------------------------------------------------------------------
// JSDoc is reconstructed from the checker's resolved documentation, which follows symbols through
// mapped types & mixins back to their original declarations.

function renderDocs(docComment: SymbolDisplayPart[], tags: JSDocTagInfo[], indent: string) {
	// Docblocks are opt-in: only `@public`-tagged documentation reaches the player-facing file.
	// Untagged docblocks are internal engine notes.
	if (!tags.some(tag => tag.name === 'public')) {
		return '';
	}
	const text = ts.displayPartsToString(docComment).trim();
	const lines = [
		...text ? text.split('\n') : [],
		// `@public` is this tool's selection marker; it carries no meaning for players
		...Fn.transform(Fn.reject(tags, tag => tag.name === 'public'), tag => {
			const tagText = ts.displayPartsToString(tag.text ?? []).trim();
			return `@${tag.name}${tagText ? ` ${tagText}` : ''}`.split('\n');
		}),
	];
	if (lines.length === 0) {
		return '';
	}
	const body = Fn.map(lines, line => line === '' ? `${indent} *` : `${indent} * ${line}`);
	return `${indent}/**\n${Fn.join(body, '\n')}\n${indent} */\n`;
}

const renderSymbolDocs = (symbol: ts.Symbol, indent: string) =>
	renderDocs(symbol.getDocumentationComment(checker), symbol.getJsDocTags(checker), indent);

// ---------------------------------------------------------------------------------------------
// Member rendering

const hasPublicTag = (symbol: ts.Symbol) => symbol.getJsDocTags(checker).some(tag => tag.name === 'public');
const skipMember = (name: string) =>
	name.startsWith('#') || name.startsWith('_$') || name.startsWith('__@') || name === 'prototype';

// ---------------------------------------------------------------------------------------------
// Branded constants (`utility/brand.ts`). The node builder loses alias references on inferred
// types, exploding e.g. `ErrorCode` into `(0 & BrandVal<"error", 0>) | (-1 & ...) | ...`. The
// brand carries enough information to reconstruct names: a union covering a family's `@public`
// alias exactly folds to a reference to the alias, any other branded literal renders as a
// reference to a same-named type alias emitted beside the constant (`type OK = typeof OK`), and
// the `BrandVal` marker itself never reaches the output.

// Set while emitting a type alias declaration so its own body renders as `typeof` constants
// rather than folding to a self-reference
let aliasBeingEmitted: ts.Symbol | undefined;

// Resolve plain and branded (`literal & BrandVal<Key, literal>`) literal types to their literal
function literalOfType(type: ts.Type) {
	const isLiteral = (type: ts.Type) => Boolean(type.flags & (ts.TypeFlags.NumberLiteral | ts.TypeFlags.StringLiteral));
	if (isLiteral(type)) {
		return type as ts.NumberLiteralType | ts.StringLiteralType;
	}
	if (type.isIntersection()) {
		return type.types.find(isLiteral) as ts.NumberLiteralType | ts.StringLiteralType | undefined;
	}
	return undefined;
}

// Extract (brand, value) from a branded literal type
function brandOfType(type: ts.Type) {
	if (!type.isIntersection()) {
		return undefined;
	}
	const literal = literalOfType(type);
	const brand = type.types.find(member =>
		Boolean(member.flags & ts.TypeFlags.Object) &&
		Boolean((member as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) &&
		(member.symbol as ts.Symbol | undefined)?.name === 'BrandVal');
	if (!literal || !brand) {
		return undefined;
	}
	const key = checker.getTypeArguments(brand as ts.TypeReference)[0];
	if (!key || !(key.flags & ts.TypeFlags.StringLiteral)) {
		return undefined;
	}
	return { brand: (key as ts.StringLiteralType).value, value: literal.value };
}

type BrandInfo = {
	// `@public` alias covering the family, when exactly one exists
	alias?: { symbol: ts.Symbol; values: Set<string | number> } | undefined;
	// First-declared constant for each value (`ERR_NOT_ENOUGH_*` all share -6)
	constants: Map<string | number, ts.Symbol>;
};
let brandsCache: Map<string, BrandInfo> | undefined;
function brands() {
	if (brandsCache) {
		return brandsCache;
	}
	const cache = brandsCache = new Map<string, BrandInfo>();
	const family = (brand: string) => {
		const info = cache.get(brand) ?? { constants: new Map<string | number, ts.Symbol>() };
		cache.set(brand, info);
		return info;
	};
	const ambiguousAliases = new Set<string>();
	for (const statement of ourStatements()) {
		if (ts.isVariableStatement(statement)) {
			if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
				continue;
			}
			for (const declaration of statement.declarationList.declarations) {
				const symbol = ts.isIdentifier(declaration.name) ? checker.getSymbolAtLocation(declaration.name) : undefined;
				const branded = symbol && brandOfType(checker.getTypeOfSymbol(symbol));
				if (symbol && branded) {
					const { constants } = family(branded.brand);
					if (!constants.has(branded.value)) {
						constants.set(branded.value, symbol);
					}
				}
			}
		} else if (ts.isTypeAliasDeclaration(statement)) {
			const symbol = checker.getSymbolAtLocation(statement.name);
			if (!symbol || !hasPublicTag(symbol)) {
				continue;
			}
			const type = checker.getDeclaredTypeOfSymbol(symbol);
			const members = (type.isUnion() ? type.types : [ type ]).map(member => brandOfType(member));
			const brand = members[0]?.brand;
			if (brand === undefined || !members.every(member => member?.brand === brand)) {
				continue;
			}
			const info = family(brand);
			if (info.alias || ambiguousAliases.has(brand)) {
				// Two public aliases over one family: neither can claim its unions
				ambiguousAliases.add(brand);
				info.alias = undefined;
			} else {
				info.alias = { symbol, values: new Set(members.map(member => member!.value)) };
			}
		}
	}
	return cache;
}

// Literal value of a literal type node, if number or string
function literalNodeValue(node: ts.TypeNode) {
	if (!ts.isLiteralTypeNode(node)) {
		return undefined;
	}
	const { literal } = node;
	if (ts.isNumericLiteral(literal)) {
		return Number(literal.text);
	} else if (
		ts.isPrefixUnaryExpression(literal) && literal.operator === ts.SyntaxKind.MinusToken &&
		ts.isNumericLiteral(literal.operand)
	) {
		return -Number(literal.operand.text);
	} else if (ts.isStringLiteral(literal)) {
		return literal.text;
	}
	return undefined;
}

// Match the type node form of a branded literal: `literal & BrandVal<"key", literal>`
function brandedLiteralNode(node: ts.TypeNode) {
	const inner = ts.isParenthesizedTypeNode(node) ? node.type : node;
	if (!ts.isIntersectionTypeNode(inner) || inner.types.length !== 2) {
		return undefined;
	}
	const literal = inner.types.find(member => ts.isLiteralTypeNode(member));
	const brand = inner.types.find(member =>
		ts.isTypeReferenceNode(member) && ts.isIdentifier(member.typeName) && member.typeName.text === 'BrandVal');
	const key = brand && ts.isTypeReferenceNode(brand) ? brand.typeArguments?.[0] : undefined;
	const value = literal && literalNodeValue(literal);
	if (!literal || value === undefined || !key || !ts.isLiteralTypeNode(key) || !ts.isStringLiteral(key.literal)) {
		return undefined;
	}
	return { brand: key.literal.text, value, literal };
}

// Fold the branded literal members of a union: members covering a family's `@public` alias
// exactly become a reference to the alias, any other branded literal becomes a reference to the
// constant's same-named type alias. Unbranded members are visited and passed through.
function foldBrandedUnion(node: ts.UnionTypeNode, visitType: (node: ts.TypeNode) => ts.TypeNode) {
	const members = node.types.map(member => ({ member, branded: brandedLiteralNode(member) }));
	if (!members.some(({ branded }) => branded)) {
		return undefined;
	}
	const result = [ ...function*(): Iterable<ts.TypeNode> {
		const foldedBrands = new Set<string>();
		for (const { member, branded } of members) {
			if (!branded) {
				yield visitType(member);
				continue;
			} else if (foldedBrands.has(branded.brand)) {
				continue;
			}
			foldedBrands.add(branded.brand);
			const group = members.flatMap(entry => entry.branded?.brand === branded.brand ? [ entry.branded ] : []);
			const info = brands().get(branded.brand);
			const alias = info?.alias;
			if (
				alias && alias.symbol !== aliasBeingEmitted &&
				alias.values.size === group.length && group.every(entry => alias.values.has(entry.value))
			) {
				yield ts.factory.createTypeReferenceNode(schedule(alias.symbol, 'type'));
				continue;
			}
			yield* Fn.map(group, entry => {
				const constant = info?.constants.get(entry.value);
				return (constant && scheduleValueSymbol(constant)) ?? entry.literal;
			});
		}
	}() ];
	return result.length === 1 ? result[0]! : ts.factory.createUnionTypeNode(result);
}

function renderMember(prop: ts.Symbol, classEnclosing: ts.Node) {
	// Resolve printed names from the property's own declaration site when possible: its file has
	// the right imports in scope
	const enclosing = prop.declarations?.find(decl => isOursFile(decl.getSourceFile().fileName)) ?? classEnclosing;
	const docs = renderSymbolDocs(prop, '\t');
	const propType = checker.getTypeOfSymbolAtLocation(prop, enclosing);
	const callSignatures = propType.getCallSignatures();
	const isPlainFunction = callSignatures.length > 0 &&
		!propType.isUnionOrIntersection() &&
		propType.getProperties().length === 0 &&
		propType.getConstructSignatures().length === 0;
	if (isPlainFunction && !(prop.flags & (ts.SymbolFlags.GetAccessor | ts.SymbolFlags.SetAccessor))) {
		// Render as method signature(s), omitting `@internal` overloads. Each signature carries its
		// own docs when it has any; symbol-level docs remain the fallback since they follow
		// mapped-type members back to their original declarations.
		return [ ...function*() {
			for (const signature of callSignatures) {
				const signatureDecl = signature.getDeclaration() as ts.SignatureDeclaration | undefined;
				if (signatureDecl && ts.getJSDocTags(signatureDecl).some(tag => tag.tagName.text === 'internal')) {
					continue;
				}
				const signatureNode = checker.signatureToSignatureDeclaration(signature, ts.SyntaxKind.MethodSignature, enclosing, builderFlags);
				if (!signatureNode) {
					continue;
				}
				const named = ts.factory.updateMethodSignature(
					signatureNode as ts.MethodSignature,
					undefined,
					ts.factory.createIdentifier(prop.name),
					prop.flags & ts.SymbolFlags.Optional ? ts.factory.createToken(ts.SyntaxKind.QuestionToken) : undefined,
					signatureNode.typeParameters && ts.factory.createNodeArray(signatureNode.typeParameters),
					ts.factory.createNodeArray(signatureNode.parameters),
					signatureNode.type,
				);
				const signatureDocs = renderDocs(signature.getDocumentationComment(checker), signature.getJsDocTags(), '\t');
				yield `${signatureDocs || docs}\t${printNode(cleanTypeNode(named, enclosing), enclosing, '\t')}`;
			}
		}() ];
	}
	const readonly = prop.flags & ts.SymbolFlags.GetAccessor && !(prop.flags & ts.SymbolFlags.SetAccessor) ? 'readonly ' : '';
	const optional = prop.flags & ts.SymbolFlags.Optional ? '?' : '';
	return [ `${docs}\t${readonly}${prop.name}${optional}: ${printTypeNode(propType, enclosing, 0, '\t')};` ];
}

function renderMembers(type: ts.Type, enclosing: ts.Node, ancestors: ts.Type[] = []) {
	// Members inherited untouched from an emitted ancestor live in the `extends` clause instead
	const isInherited = (prop: ts.Symbol) => ancestors.some(ancestor => {
		const ancestorProp = checker.getPropertyOfType(ancestor, prop.name);
		return ancestorProp !== undefined && (
			ancestorProp === prop ||
			(ancestorProp.declarations?.[0] !== undefined && ancestorProp.declarations[0] === prop.declarations?.[0])
		);
	});
	const declared = checker.getPropertiesOfType(type).filter(prop => !skipMember(prop.name) && !isInherited(prop));
	// `@public` filtering applies only when the type's own members participate in the annotation
	// system; inherited members must not trip it (e.g. an untagged interface extending a public one)
	const anyPublic = declared.some(prop => hasPublicTag(prop));
	const included = anyPublic ? declared.filter(prop => hasPublicTag(prop)) : declared;
	// Members re-declared over an ancestor must be Omit<>ed: class overrides may narrow
	// bivariantly in ways interface `extends` rejects
	const overridden = Fn.groupBy(Fn.transform(included, prop => Fn.pipe(
		ancestors,
		$$ => Fn.filter($$, ancestor => {
			const ancestorProp = checker.getPropertyOfType(ancestor, prop.name);
			return ancestorProp !== undefined &&
				!checker.isTypeAssignableTo(checker.getTypeOfSymbol(prop), checker.getTypeOfSymbol(ancestorProp));
		}),
		$$ => Fn.map($$, ancestor => [ ancestor, prop.name ] as const))));
	const lines = [ ...Fn.transform(included, prop => renderMember(prop, enclosing)) ];
	return { lines, overridden };
}

// ---------------------------------------------------------------------------------------------
// Declaration emission

// Find the nearest ancestor class type that is itself part of the public API. Walks through the
// anonymous `withOverlay` mixin intersections.
function findAncestor(declaredType: ts.InterfaceType): ts.Type | undefined {
	for (const base of checker.getBaseTypes(declaredType)) {
		const types = base.isIntersection() ? base.types : [ base ];
		const direct = Fn.find(types, type =>
			(type.symbol as ts.Symbol | undefined) !== undefined && Boolean(type.symbol.flags & ts.SymbolFlags.Class) &&
			isOurs(type.symbol) && type.symbol.name !== '__class' && hasPublicTag(type.symbol));
		if (direct) {
			return direct;
		}
		for (const type of types) {
			if (type.symbol as ts.Symbol | undefined && type.symbol.flags & ts.SymbolFlags.Class) {
				const deeper = findAncestor(checker.getDeclaredTypeOfSymbol(type.symbol) as ts.InterfaceType);
				if (deeper) {
					return deeper;
				}
			}
		}
	}
	return undefined;
}

function typeParametersText(symbol: ts.Symbol) {
	for (const decl of symbol.declarations ?? []) {
		if (
			(ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) &&
			decl.typeParameters !== undefined && decl.typeParameters.length > 0
		) {
			const params = Fn.map(decl.typeParameters, param => {
				const constraint = param.constraint && `extends ${printNode(cleanTypeNode(param.constraint, decl), decl)}`;
				const defaultType = param.default && `= ${printNode(cleanTypeNode(param.default, decl), decl)}`;
				return Fn.join(Fn.filter([ param.name.text, constraint, defaultType ], nonNullPredicate), ' ');
			});
			return `<${Fn.join(params, ', ')}>`;
		}
	}
	return '';
}

function emitType(name: string, symbol: ts.Symbol) {
	if (symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
		const declaredType = checker.getDeclaredTypeOfSymbol(symbol) as ts.InterfaceType;
		const enclosing = symbol.declarations?.find(decl => ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) ?? symbol.declarations?.[0];
		if (!enclosing) {
			return;
		}
		const ancestors = function() {
			if (symbol.flags & ts.SymbolFlags.Class) {
				const ancestor = findAncestor(declaredType);
				return ancestor && ancestor.symbol !== symbol ? [ ancestor ] : [];
			}
			// Interface `extends` bases which are themselves part of the public API stay in the
			// heritage clause; anything else is flattened into the interface body
			return checker.getBaseTypes(declaredType).filter(base =>
				(base.symbol as ts.Symbol | undefined) !== undefined && base.symbol !== symbol &&
				Boolean(base.symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) &&
				((base as ts.TypeReference).typeArguments?.length ?? 0) === 0 &&
				isOurs(base.symbol) && hasPublicTag(base.symbol));
		}();
		const { lines, overridden } = renderMembers(declaredType, enclosing, ancestors);
		const extendsClause = function() {
			if (ancestors.length === 0) {
				return '';
			}
			const bases = Fn.map(ancestors, ancestor => {
				const ancestorName = schedule(ancestor.symbol, 'type');
				// Overridden members may not be assignable to the base declaration; Omit<> them
				const omitted = overridden.get(ancestor);
				return omitted === undefined
					? ancestorName
					: `Omit<${ancestorName}, ${Fn.join(Fn.map(omitted, name => JSON.stringify(name)), ' | ')}>`;
			});
			return ` extends ${Fn.join(bases, ', ')}`;
		}();
		const docs = renderSymbolDocs(symbol, '');
		const section = symbol.flags & ts.SymbolFlags.Class ? 'Constructors & objects' : 'Utilities';
		emitted.set(name, [ { section, text: `${docs}interface ${name}${typeParametersText(symbol)}${extendsClause} {\n${lines.join('\n\n')}\n}` } ]);
	} else if (symbol.flags & ts.SymbolFlags.TypeAlias) {
		const enclosing = symbol.declarations?.[0];
		if (!enclosing) {
			return;
		}
		const declaredType = checker.getDeclaredTypeOfSymbol(symbol);
		const docs = renderSymbolDocs(symbol, '');
		aliasBeingEmitted = symbol;
		const text = printTypeNode(declaredType, enclosing, ts.NodeBuilderFlags.InTypeAlias);
		aliasBeingEmitted = undefined;
		emitted.set(name, [ { section: 'Utilities', text: `${docs}type ${name}${typeParametersText(symbol)} = ${text};` } ]);
	} else {
		console.error(`warning: don't know how to emit type '${name}'`);
	}
}

// Emit the static side of a class as `interface FooConstructor`
function emitConstructor(name: string, symbol: ts.Symbol) {
	const instanceName = schedule(symbol, 'type');
	const classDecl = symbol.declarations?.find(decl => ts.isClassDeclaration(decl));
	if (!classDecl) {
		return;
	}
	const lines = [ ...function*() {
		// Constructor signatures come only from constructors the class declares itself. When overload
		// declarations exist the implementation signature is skipped, as are @internal overloads.
		const ctor = symbol.members?.get(ts.InternalSymbolName.Constructor);
		if (ctor) {
			const declarations = (ctor.declarations ?? []).filter(decl => ts.isConstructorDeclaration(decl));
			const overloads = declarations.filter(decl => !decl.body);
			const visible = (overloads.length > 0 ? overloads : declarations).filter(decl =>
				!ts.getJSDocTags(decl).some(tag => tag.tagName.text === 'internal'));
			for (const decl of visible) {
				const signature = checker.getSignatureFromDeclaration(decl);
				const signatureNode = signature && checker.signatureToSignatureDeclaration(signature, ts.SyntaxKind.ConstructSignature, classDecl, builderFlags);
				if (!signature || !signatureNode) {
					continue;
				}
				const withReturn = ts.factory.updateConstructSignature(
					signatureNode as ts.ConstructSignatureDeclaration,
					signatureNode.typeParameters && ts.factory.createNodeArray(signatureNode.typeParameters),
					ts.factory.createNodeArray(signatureNode.parameters),
					ts.factory.createTypeReferenceNode(instanceName),
				);
				const docs = renderDocs(signature.getDocumentationComment(checker), signature.getJsDocTags(), '\t');
				yield `${docs}\t${printNode(cleanTypeNode(withReturn, classDecl), classDecl, '\t')}`;
			}
		}
		// Public statics
		const staticType = checker.getTypeOfSymbol(symbol);
		yield* Fn.transform(
			Fn.reject(checker.getPropertiesOfType(staticType), prop =>
				skipMember(prop.name) || prop.name === 'name' || prop.name === 'length' || !hasPublicTag(prop)),
			prop => renderMember(prop, classDecl));
		yield `\treadonly prototype: ${instanceName};`;
	}() ];
	emitted.set(name, [ { section: 'Constructors & objects', text: `interface ${name} {\n${lines.join('\n\n')}\n}` } ]);
}

function emitConst(name: string, symbol: ts.Symbol) {
	const decl = symbol.declarations?.[0];
	if (!decl) {
		return;
	}
	const type = checker.getTypeOfSymbol(symbol);
	const docs = renderSymbolDocs(symbol, '');
	const text = type.flags & ts.TypeFlags.UniqueESSymbol
		? 'unique symbol'
		: printTypeNode(type, decl, ts.NodeBuilderFlags.MultilineObjectLiterals);
	emitted.set(name, [
		{ section: 'Constants', text: `${docs}declare const ${name}: ${text};` },
		// Branded constants carry a same-named type alias -- documented like the constant itself --
		// so type positions can reference the constant by bare name (`OK`) rather than `typeof OK`
		...brandOfType(type) ? [ { section: 'Constant types', text: `${docs}type ${name} = typeof ${name};` } as const ] : [],
	]);
}

// ---------------------------------------------------------------------------------------------
// Seeds: the `Game` object, everything registered on the runtime `Global` interface, and the
// mod-aware constants.

// Source files of the core package
const getSource = (path: string) => program.getSourceFile(new URL(path, xxpackage.source).pathname);

const globals = [ ...function*() {
	{
		const gameFile = getSource('game/game.ts')!;
		const gameClass = gameFile.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'Game')!;
		const gameSymbol = canonical(checker.getSymbolAtLocation(gameClass.name!)!);
		schedule(gameSymbol, 'type');
		yield 'declare const Game: Game;';
	}

	const runtimeFile = getSource('game/runtime.ts')!;
	const runtimeModule = checker.getSymbolAtLocation(runtimeFile);
	const globalSymbol = runtimeModule?.exports?.get('Global' as ts.__String);
	if (!globalSymbol) {
		console.error('warning: no `Global` interface found');
		return;
	}
	const globalType = checker.getDeclaredTypeOfSymbol(globalSymbol);
	for (const prop of checker.getPropertiesOfType(globalType)) {
		if (prop.name === '_') {
			continue; // lodash: out of scope
		}
		const decl = prop.declarations?.[0];
		if (!decl) {
			continue;
		}
		const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
		const docs = renderSymbolDocs(prop, '');
		if (!(propType.flags & ts.TypeFlags.Object) && !propType.isUnionOrIntersection()) {
			// e.g. `Memory: any`
			yield `${docs}declare const ${prop.name}: ${checker.typeToString(propType)};`;
			continue;
		}
		const target = propType.symbol as ts.Symbol | undefined && canonical(propType.symbol);
		if (target && target.flags & ts.SymbolFlags.Class && isOurs(target)) {
			yield `${docs}declare const ${prop.name}: ${schedule(target, 'constructor')};`;
		} else if (isOurs(prop) && propType.getProperties().length > 0) {
			// Value global with an object type (PathFinder, RawMemory): synthesize an interface
			if (!emitted.has(prop.name)) {
				const { lines } = renderMembers(propType, decl);
				namesTaken.set(prop.name, prop);
				emitted.set(prop.name, [ { section: 'Constructors & objects', text: `${docs}interface ${prop.name} {\n${lines.join('\n\n')}\n}` } ]);
			}
			yield `declare const ${prop.name}: ${prop.name};`;
		} else {
			yield `${docs}declare const ${prop.name}: ${printTypeNode(propType, decl)};`;
		}
	}
}() ];

{
	const constantsFile = getSource('game/constants/index.ts');
	const moduleSymbol = constantsFile && checker.getSymbolAtLocation(constantsFile);
	for (const exportSymbol of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
		const symbol = canonical(exportSymbol);
		if (symbol.declarations?.[0] && symbol.flags & ts.SymbolFlags.Variable) {
			// Scheduled through the shared registry so constants referenced from `typeof X`
			// positions aren't emitted twice
			schedule(symbol, 'const');
		}
	}
}

// Drain the queue; emissions schedule their own dependencies
for (let guard = 0; queue.length > 0; ++guard) {
	if (guard > 10000) {
		throw new Error('Type emission did not converge');
	}
	const { symbol, kind, name } = queue.shift()!;
	if (emitted.has(name)) {
		continue;
	}
	if (kind === 'type') {
		emitType(name, symbol);
	} else if (kind === 'constructor') {
		emitConstructor(name, symbol);
	} else {
		emitConst(name, symbol);
	}
}

// ---------------------------------------------------------------------------------------------
// Write & validate the result

// Consecutive one-line declarations pack together; anything multi-line keeps a blank line on
// both sides
function joinDeclarations(texts: Iterable<string>) {
	let out = '';
	let previousOneLine = false;
	for (const text of texts) {
		const oneLine = !text.includes('\n');
		out = out === '' ? text : `${out}${previousOneLine && oneLine ? '\n' : '\n\n'}${text}`;
		previousOneLine = oneLine;
	}
	return out;
}

const output = `// Generated by \`xxscreeps types\`.
/* eslint-disable */

${Fn.pipe(
	sections,
	$$ => Fn.map($$, section => {
		const texts = section === 'Globals'
			? globals
			: Fn.map(Fn.filter(Fn.transform(emitted.values(), $$ => $$), entry => entry.section === section), entry => entry.text);
		return `// ${section}\n\n${joinDeclarations(texts)}`;
	}),
	$$ => Fn.join($$, '\n\n'),
)}
`;
await fs.mkdir(new URL('.', outFile), { recursive: true });
await fs.writeFile(outFile, output);
console.log(`Emitted ${emitted.size} declarations & ${globals.length} globals to ${outFile.pathname}`);

{
	const validation = ts.createProgram({
		rootNames: [ outFile.pathname ],
		options: {
			noEmit: true,
			strict: true,
			target: ts.ScriptTarget.ESNext,
			lib: [ 'lib.esnext.d.ts' ],
			types: [],
		},
	});
	const diagnostics = [ ...validation.getSyntacticDiagnostics(), ...validation.getSemanticDiagnostics() ];
	if (diagnostics.length > 0) {
		console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics.slice(0, 20), {
			getCanonicalFileName: fileName => fileName,
			getCurrentDirectory: () => outFile.pathname,
			getNewLine: () => '\n',
		}));
		console.error(`Generated types failed to check with ${diagnostics.length} diagnostics`);
		process.exitCode = 1;
	} else {
		console.log('Generated types check OK');
	}
}
