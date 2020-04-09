import { declare, inherit, variant } from '~/lib/schema';
import { StructureContainer } from '~/game/objects/structures/container';
import * as Store from './store';
import * as Structure from './structure';

export const shape = declare('Container', {
	...inherit(Structure.format),
	...variant('container'),
	store: Store.format,
	_nextDecayTime: 'int32',
});

export const format = declare(shape, { overlay: StructureContainer });
