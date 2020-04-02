import { bindInterceptors, bindName, Inherit, Variant } from '~/lib/schema';
import { StructureExtension } from '~/game/objects/structures/extension';
import * as Store from './store';
import * as Structure from './structure';

export const shape = bindName('Extension', {
	[Inherit]: Structure.format,
	[Variant]: 'extension',
	store: Store.format,
});

export const format = bindInterceptors(shape, { overlay: StructureExtension });
