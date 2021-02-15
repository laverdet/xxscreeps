import { declare, inherit, variant, TypeOf } from 'xxscreeps/schema';
import { StructureContainer } from 'xxscreeps/game/objects/structures/container';
import * as Store from './store';
import * as Structure from './structure';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Container', {
	...inherit(Structure.format),
	...variant('container'),
	store: Store.format,
	_nextDecayTime: 'int32',
});

export const format = declare(shape, { overlay: StructureContainer });
