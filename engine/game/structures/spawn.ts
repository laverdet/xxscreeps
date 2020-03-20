import * as RoomObject from '../room-object';
import { makeInherit, Variant } from '~/engine/schema/format';
import { Interceptors } from '~/engine/schema/interceptor';

export const format = makeInherit(RoomObject.format, {
	[Variant]: 'spawn',
	name: 'string' as const,
});

export class StructureSpawn extends RoomObject.RoomObject {
	name!: string;
}

export const interceptors: Interceptors = {
	overlay: StructureSpawn,
};
