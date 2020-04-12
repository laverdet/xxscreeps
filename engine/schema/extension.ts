import { declare, inherit, variant, TypeOf } from '~/lib/schema';
import { StructureExtension } from '~/game/objects/structures/extension';
import * as Store from './store';
import * as Structure from './structure';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Extension', {
	...inherit(Structure.format),
	...variant('extension'),
	store: Store.restricted<'energy'>(),
});

export const format = declare(shape, { overlay: StructureExtension });
