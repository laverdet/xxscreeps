import type { Format } from './format';
import type { Layout, LayoutAndTraits } from './layout';
import type { MemberReader, Reader } from './read';
import type { MemberWriter, Writer } from './write';
export { getOrSet } from 'xxscreeps/utility/utility';

export class Cache {
	public readonly layout = new Map<Format, LayoutAndTraits>();
	public readonly memberReader = new Map<Layout, MemberReader>();
	public readonly memberWriter = new Map<Layout, MemberWriter>();
	public readonly reader = new Map<Layout, Reader>();
	public readonly writer = new Map<Layout, Writer>();
}
