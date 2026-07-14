import type { Node, NodePath, PluginObj, Visitor } from '@babel/core';
import type { VisitNode } from '@babel/traverse';
// eslint-disable-next-line id-length
import * as t from '@babel/types';
import { getOrSet } from 'xxscreeps/utility/utility.js';

interface State {
	library?: {
		declaration: NodePath<t.ImportDeclaration>;
		namespace: t.Identifier;
	};
	program: NodePath<t.Program>;
	methods: Map<string, t.Identifier>;
}

function extractPrivateName(node: t.Expression | t.PrivateName) {
	if (t.isStringLiteral(node) && node.value.startsWith('#')) {
		return node;
	}
}

function extractPrivate(node: Node) {
	if (
		t.isMemberExpression(node, { computed: true }) ||
		t.isOptionalMemberExpression(node, { computed: true })
	) {
		const name = extractPrivateName(node.property);
		if (name) {
			return { name, object: node.object };
		}
	}
	return {};
}

const findParent = <As extends NodePath>(path: NodePath, predicate: (path: NodePath) => path is As) =>
	path.findParent(predicate) as NodePath<As extends NodePath<infer A> ? A : never> | null;

const makeLambda = (params: t.Identifier[], expr: t.Expression) =>
	t.functionExpression(undefined, params,
		t.blockStatement([ t.returnStatement(expr) ]));

// Remove line number metadata from the token. Since we move these around and retain lines it will
// cause a cascade of newlines.
function stripString(string: t.StringLiteral) {
	return t.stringLiteral(string.value);
}

export default function transform(): PluginObj {
	const runtimePath = `${new URL('./runtime.js', import.meta.url)}`;

	// Node build which invokes a method from `./runtime.ts`
	function invokeRuntime(state: State, name: string, args: t.Expression[]) {
		state.library ??= function() {
			const namespace = state.program.scope.generateUidIdentifier('privateRuntime');
			const declaration = t.importDeclaration([ t.importNamespaceSpecifier(namespace) ], t.stringLiteral(runtimePath));
			const declarationPath = state.program.unshiftContainer('body', declaration);
			return {
				declaration: declarationPath[0],
				namespace,
			};
		}();
		const method = t.memberExpression(state.library.namespace, t.identifier(name));
		return t.callExpression(method, args);
	}

	// Invokes a method from `./runtime.ts` at the top level of the current program. Assigns the
	// result to an identifier and returns that identifier.
	function injectMaker(state: State, name: string, idName: string, args: t.Expression[]) {
		return getOrSet(state.methods, name + idName, () => {
			const id = state.program.scope.generateUidIdentifier(idName);
			const makeResult = invokeRuntime(state, name, args);
			state.library!.declaration.insertAfter(
				t.variableDeclaration('const', [
					t.variableDeclarator(id, makeResult),
				]),
			);
			return id;
		});
	}

	// Replace:
	// `obj['#foo'](val)` -> `makeInvoke('foo')(obj, val)`
	// `super['#foo'](val)` -> `makeSuperInvoke('foo')(home, obj, val)`
	const visitCallExpression: VisitNode<State, t.CallExpression | t.OptionalCallExpression> = function(path) {
		const { node } = path;
		const { name, object } = extractPrivate(node.callee);
		if (name) {
			const isOptional = (node.optional === true) || t.isOptionalCallExpression(node);
			const optional = t.booleanLiteral(isOptional);
			const methodKey = `${name.value.slice(1)}${isOptional ? 'Opt' : ''}`;
			if (t.isSuper(object)) {
				const fn = path.getFunctionParent();
				const home = fn && findParent(fn, path => path.isClass() || path.isObjectExpression());
				if (home?.isClass()) {
					const homeName = home.node.id;
					if (homeName) {
						const runtimeValue = injectMaker(this, 'makeSuperInvoke', `super${methodKey}`, [ stripString(name), optional ]);
						const next = t.callExpression(runtimeValue, [ t.identifier(homeName.name), t.thisExpression(), ...node.arguments ]);
						path.replaceWith(next);
					}
				}
			} else {
				const runtimeValue = injectMaker(this, 'makeInvoke', `call${methodKey}`, [ stripString(name), optional ]);
				const next = t.callExpression(runtimeValue, [ object, ...node.arguments ]);
				path.replaceWith(next);
			}
		}
	};

	// Replace `obj['#foo'] = val` -> `makeGetter('foo')(obj)`
	const visitMemberExpression: VisitNode<State, t.MemberExpression | t.OptionalMemberExpression> = function(path) {
		const { node } = path;
		const { name, object } = extractPrivate(node);
		if (name) {
			const isOptional = (node.optional === true) || t.isOptionalMemberExpression(node);
			const optional = t.booleanLiteral(isOptional);
			const methodKey = `${name.value.slice(1)}${isOptional ? 'Opt' : ''}`;
			const runtimeValue = injectMaker(this, 'makeGetter', `get${methodKey}`, [ stripString(name), optional ]);
			const next = t.callExpression(runtimeValue, [ object ]);
			path.replaceWith(next);
		}
	};

	// Replace:
	// `{ ['#foo']: true }` -> `{ [getSymbol('foo')]: true }`
	type MethodExceptPrivate = Exclude<t.Method | t.Property, t.ClassPrivateMethod | t.ClassPrivateProperty>;
	const visitProperty: VisitNode<State, MethodExceptPrivate> = function(path) {
		const { node } = path;
		const name = extractPrivateName(node.key);
		if (!name) {
			return;
		}
		node.computed = true;
		const runtimeValue = injectMaker(this, 'getSymbol', `symbol${name.value.slice(1)}`, [ name ]);
		path.get('key').replaceWith(runtimeValue);
	};

	const visitor: Visitor<State> = {

		AssignmentExpression(path) {
			const { node } = path;
			const { name, object } = extractPrivate(node.left);
			if (name) {
				if (node.operator === '=') {
					// Replace `obj['#foo'] = val` -> `makeSetter('foo')(obj, val)`
					const runtimeValue = injectMaker(this, 'makeSetter', `set${name.value.slice(1)}`, [ stripString(name) ]);
					const next = t.callExpression(runtimeValue, [ object, node.right ]);
					path.replaceWith(next);

				} else if (node.operator === '??=') {
					// Replace `obj['#foo'] ??= 123` -> `makeMutator('foo')(obj, val => val ?? makeGetter('foo')(obj)())`
					const id = this.program.scope.generateUidIdentifier('val');
					const runtimeValue = injectMaker(this, 'makeMutator', `mut${name.value.slice(1)}`, [ stripString(name) ]);
					const next = t.callExpression(runtimeValue, [ object, makeLambda([ id ], t.logicalExpression('??', id, node.right)) ]);
					path.replaceWith(next);

				} else if (/^.=$/.test(node.operator)) {
					// Replace `obj['#foo'] += val` -> `makeMutator('foo')(obj, val => val + 1)`
					const id = this.program.scope.generateUidIdentifier('val');
					const runtimeValue = injectMaker(this, 'makeMutator', `mut${name.value.slice(1)}`, [ stripString(name) ]);
					const operator = node.operator.charAt(0) satisfies string as t.BinaryExpression['operator'];
					const next = t.callExpression(runtimeValue, [ object, makeLambda([ id ], t.binaryExpression(operator, id, node.right)) ]);
					path.replaceWith(next);
				}
			}
		},

		UpdateExpression(path) {
			const { node } = path;
			const { name, object } = extractPrivate(node.argument);
			if (name) {
				// Replace `++obj['#foo']` -> `makeMutator('foo')(obj, val => val + 1)`
				const id = this.program.scope.generateUidIdentifier('val');
				const methodKey = `mut${name.value.slice(1)}${node.prefix ? '' : 'Post'}`;
				const runtimeValue = injectMaker(this, 'makeMutator', methodKey, [ stripString(name), t.booleanLiteral(!node.prefix) ]);
				const operator = node.operator.charAt(0) satisfies string as t.BinaryExpression['operator'];
				const next = t.callExpression(runtimeValue, [ object, makeLambda([ id ], t.binaryExpression(operator, id, t.numericLiteral(1))) ]);
				path.replaceWith(next);
			}
		},

		MemberExpression: visitMemberExpression,
		OptionalMemberExpression: visitMemberExpression,

		CallExpression: visitCallExpression,
		OptionalCallExpression: visitCallExpression,

		ClassMethod: visitProperty,
		ClassProperty: visitProperty,
		ObjectMethod: visitProperty,
		ObjectProperty: visitProperty,
	};
	return {
		visitor: {
			Program(path) {
				path.traverse(visitor, { program: path, methods: new Map() });
				path.stop();
			},
		},
	};
}
