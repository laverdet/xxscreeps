import { checkCast, makeOptional, makeVector, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';
import * as Id from '~/engine/util/id';
import { StructureSpawn } from '~/game/objects/structures/spawn';
import * as Store from './store';
import * as Structure from './structure';

export { StructureSpawn };

export const spawningFormat = checkCast<Format>()({
	creep: Id.format,
	directions: makeVector('int8'),
	endTime: 'int32',
	needTime: 'int32',
});

export const format = withType<StructureSpawn>(checkCast<Format>()({
	[Inherit]: Structure.format,
	[Variant]: 'spawn',
	name: 'string',
	spawning: makeOptional(spawningFormat),
	store: Store.format,
}));

export const interceptors = {
	Spawning: checkCast<Interceptor>()({
		members: { creep: Id.interceptors },
	}),
	StructureSpawn: checkCast<Interceptor>()({
		overlay: StructureSpawn,
	}),
};

export const schemaFormat = {
	Spawning: spawningFormat,
	StructureSpawn: format,
};
