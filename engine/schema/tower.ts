import { declare, inherit, variant, TypeOf } from '~/lib/schema';
import { StructureTower } from '~/game/objects/structures/tower';
import * as Store from './store';
import * as Structure from './structure';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Tower', {
	...inherit(Structure.format),
	...variant('tower'),
	store: Store.restricted<'energy'>(),
});

export const format = declare(shape, { overlay: StructureTower });
