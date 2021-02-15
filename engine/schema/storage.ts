import { declare, inherit, variant, TypeOf } from 'xxscreeps/schema';
import { StructureStorage } from 'xxscreeps/game/objects/structures/storage';
import * as Store from './store';
import * as Structure from './structure';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Storage', {
	...inherit(Structure.format),
	...variant('storage'),
	store: Store.format,
});

export const format = declare(shape, { overlay: StructureStorage });
