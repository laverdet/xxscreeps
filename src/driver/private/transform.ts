import type { Node, NodePath, PluginObj, Visitor } from '@babel/core';
import type { VisitNode } from '@babel/traverse';
import * as t from '@babel/types';
import { getOrSet } from 'xxscreeps/utility/utility';

function extractPrivateName(node: Node) {
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

export default function(): PluginObj {
	const runtimePath = `${new URL('./runtime.js', import.meta.url)}`;
	type State = {
		library?: {
			declaration: NodePath<t.ImportDeclaration>;
			namespace: t.Identifier;
		};
		program: NodePath<t.Program>;
		methods: Map<string, any>;
	};

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

	// Replace `obj['#foo'](val)` -> `makeInvoke('foo')(obj, val)`
	const visitCallExpression: VisitNode<State, t.CallExpression | t.OptionalCallExpression> = path => {
		const { node } = path;
		const { name, object } = extractPrivate(node.callee);
		if (name) {
			const isOptional = (node.optional === true) || t.isOptionalCallExpression(node);
			const optional = t.booleanLiteral(isOptional);
			const methodKey = `${name.value.substr(1)}${isOptional ? 'Opt' : ''}`;
			if (t.isSuper(object)) {
				path.replaceWith(t.callExpression(
					injectMaker(path.state, 'makeInvoke', `super${methodKey}`, [ name, optional, t.booleanLiteral(true) ]),
					[ t.thisExpression(), ...node.arguments ]));
			} else {
				path.replaceWith(t.callExpression(
					injectMaker(path.state, 'makeInvoke', `call${methodKey}`, [ name, optional ]),
					[ object!, ...node.arguments ]));
			}
		}
	};

	// Replace `obj['#foo'] = val` -> `makeGetter('foo')(obj)`
	const visitMemberExpression: VisitNode<State, t.MemberExpression | t.OptionalMemberExpression> = path => {
		const { node } = path;
		const { name, object } = extractPrivate(node);
		if (name) {
			const isOptional = (node.optional === true) || t.isOptionalMemberExpression(node);
			const optional = t.booleanLiteral(isOptional);
			const methodKey = `${name.value.substr(1)}${isOptional ? 'Opt' : ''}`;
			path.replaceWith(t.callExpression(
				injectMaker(path.state, 'makeGetter', `get${methodKey}`, [ name, optional ]),
				[ object! ]));
		}
	};

	// Replace `{ ['#foo']: true }` -> `{ [getSymbol('foo')]: true }`
	const visitProperty: VisitNode<State, t.Method | t.Property> = path => {
		const { node } = path;
		if (t.isClassPrivateProperty(node)) {
			return;
		}
		const name = extractPrivateName(node.key);
		if (name) {
			node.computed = true;
			path.get('key').replaceWith(invokeRuntime(path.state, 'getSymbol', [ name ]));
		}
	};

	const visitor: Visitor<State> = {

		// Replace `obj['#foo'] = val` -> `makeSetter('foo')(obj, val)`
		AssignmentExpression(path) {
			const { node } = path;
			if (node.operator === '=') {
				const { name, object } = extractPrivate(node.left);
				if (name) {
					path.replaceWith(t.callExpression(
						injectMaker(path.state, 'makeSetter', `set${name.value.substr(1)}`, [ name ]),
						[ object!, node.right ]));
				}
			}
		},

		MemberExpression: visitMemberExpression,
		OptionalMemberExpression: visitMemberExpression,

		CallExpression: visitCallExpression,
		OptionalCallExpression: visitCallExpression,

		Method: visitProperty,
		Property: visitProperty,
	};
	return {
		visitor: {
			Program(path) {
				path.traverse(visitor, { program: path, methods: new Map });
				path.stop();
			},
		},
	};
}
