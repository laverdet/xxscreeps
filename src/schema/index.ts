import type { Layout } from './layout';
import type { MemberReader, Reader } from './read';
import type { MemberWriter, Writer } from './write';

export type { Format, ShapeOf, TypeOf } from './format';
export { BufferObject } from './buffer-object';
export { BufferView } from './buffer-view';
export { array, compose, constant, declare, enumerated, optional, struct, union, variant, vector, withType } from './format';
export { withOverlay } from './overlay';
export { makeReader } from './read';
export { makeWriter } from './write';

export const Variant = Symbol('schemaVariant') as never as '_$Variant';

export class Builder {
	readonly materialize;
	readonly memberReader = new Map<Layout, MemberReader>();
	readonly memberWriter = new Map<Layout, MemberWriter>();
	readonly reader = new Map<Layout, Reader>();
	readonly writer = new Map<Layout, Writer>();
	constructor(options: { materialize?: boolean } = {}) {
		this.materialize = options.materialize ?? false;
	}
}
