import { bindInterceptors, bindName, makeOptional, makeVector, Inherit, Variant } from '~/lib/schema';
import * as Id from '~/engine/util/schema/id';
import { StructureSpawn } from '~/game/objects/structures/spawn';
import * as Store from './store';
import * as Structure from './structure';

export const shape = bindName('Spawn', {
	[Inherit]: Structure.format,
	[Variant]: 'spawn',
	name: 'string',
	spawning: makeOptional({
		creep: Id.format,
		directions: makeVector('int8'),
		endTime: 'int32',
		needTime: 'int32',
	}),
	store: Store.format,
});

export const format = bindInterceptors(shape, { overlay: StructureSpawn });
