import { declare, inherit, variant } from '~/lib/schema';
import { StructureExtension } from '~/game/objects/structures/extension';
import * as Store from './store';
import * as Structure from './structure';

export const shape = declare('Extension', {
	...inherit(Structure.format),
	...variant('extension'),
	store: Store.format,
});

export const format = declare(shape, { overlay: StructureExtension });
