import { declare, inherit, variant } from '~/lib/schema';
import { StructureRoad } from '~/game/objects/structures/road';
import * as Structure from './structure';

export const shape = declare('Road', {
	...inherit(Structure.format),
	...variant('road'),
	_nextDecayTime: 'int32',
});

export const format = declare(shape, { overlay: StructureRoad });
