import * as Structure from '.';
import * as C from '~/engine/game/constants';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/engine/schema';

export const format = withType<StructureSpawn>(checkCast<Format>()({
	[Inherit]: Structure.format,
	[Variant]: 'spawn',
	name: 'string',
}));

export class StructureSpawn extends Structure.Structure {
	get [Variant]() { return 'spawn' }
	get structureType() { return C.STRUCTURE_SPAWN }

	name!: string;
}

export const interceptors = checkCast<Interceptor>()({
	overlay: StructureSpawn,
});
