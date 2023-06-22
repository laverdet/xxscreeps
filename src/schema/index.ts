import type { Layout } from './layout.js';
import type { MemberReader, Reader } from './read.js';
import type { Scanner } from './scan.js';
import type { MemberWriter, Writer } from './write.js';

export type { Format, ShapeOf, TypeOf } from './format.js';
export { BufferObject } from './buffer-object.js';
export { BufferView } from './buffer-view.js';
export { array, compose, constant, declare, enumerated, optional, struct, union, variant, vector, withType } from './format.js';
export { withOverlay } from './overlay.js';
export { makeReader } from './read.js';
export { makeWriter } from './write.js';

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
