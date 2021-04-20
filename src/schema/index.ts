import type { Layout } from './layout';
import type { MemberReader, Reader } from './read';
import type { MemberWriter, Writer } from './write';
import { XSymbol } from './symbol';

export { XSymbol };
export const Variant = XSymbol('schemaVariant');
export type { Format, ShapeOf, TypeOf } from './format';
export { BufferView } from './buffer-view';
export { array, compose, constant, declare, enumerated, optional, struct, variant, vector, withFallback, withType } from './format';
export { withOverlay } from './overlay';
export { makeReader } from './read';
export { makeWriter } from './write';

export class Cache {
	public readonly memberReader = new Map<Layout, MemberReader>();
	public readonly memberWriter = new Map<Layout, MemberWriter>();
	public readonly reader = new Map<Layout, Reader>();
	public readonly writer = new Map<Layout, Writer>();
}
