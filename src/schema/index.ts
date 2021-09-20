import type { Layout } from './layout';
import type { MemberReader, Reader } from './read';
import type { Scanner } from './scan';
import type { MemberWriter, Writer } from './write';

export type { Format, ShapeOf, TypeOf } from './format';
export { BufferObject } from './buffer-object';
export { BufferView } from './buffer-view';
export { array, compose, constant, declare, enumerated, optional, struct, union, variant, vector, withType } from './format';
export { withOverlay } from './overlay';
export { makeReader } from './read';
export { makeWriter } from './write';

export const Variant = Symbol('schemaVariant') as never as '_$Variant';

export type BuilderOptions = {
	materialize?: boolean;
};
export class Builder {
	readonly materialize;
	readonly memberReader = new Map<Layout, MemberReader>();
	readonly memberWriter = new Map<Layout, MemberWriter>();
	readonly reader = new Map<Layout, Reader>();
	readonly scanner = new Map<Layout, Scanner>();
	readonly writer = new Map<Layout, Writer>();
	constructor(options: BuilderOptions = {}) {
		this.materialize = options.materialize ?? false;
	}
}

// Workaround for TypeScript bug:
// https://github.com/microsoft/TypeScript/issues/10530
export function assertVariant<Type, Var extends string>(_schema: Type, _variant: Var):
		asserts _schema is Extract<Type, { [Variant]: Var }> {
}
