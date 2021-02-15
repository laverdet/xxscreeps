import { declare, optional, inherit, variant, vector, TypeOf } from 'xxscreeps/schema';
import * as Id from 'xxscreeps/engine/util/schema/id';
import { StructureSpawn } from 'xxscreeps/game/objects/structures/spawn';
import * as Store from './store';
import * as Structure from './structure';

export type Shape = TypeOf<typeof shape>;
const shape = declare('Spawn', {
	...inherit(Structure.format),
	...variant('spawn'),
	name: 'string',
	spawning: optional({
		creep: Id.format,
		directions: vector('int8'),
		endTime: 'int32',
		needTime: 'int32',
	}),
	store: Store.restricted<'energy'>(),
});

export const format = declare(shape, { overlay: StructureSpawn });
