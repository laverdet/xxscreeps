import { declare, inherit, variant } from '~/lib/schema';
import { StructureStorage } from '~/game/objects/structures/storage';
import * as Store from './store';
import * as Structure from './structure';

export const shape = declare('Storage', {
	...inherit(Structure.format),
	...variant('storage'),
	store: Store.format,
});

export const format = declare(shape, { overlay: StructureStorage });
