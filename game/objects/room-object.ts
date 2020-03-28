import * as C from '~/game/constants';
import * as RoomPosition from '~/game/position';
import type { Room } from '~/game/room';
import { Process, ProcessorSpecification, Tick } from '~/engine/processor/bind';
import { BufferObject } from '~/lib/schema/buffer-object';
import type { Variant } from '~/lib/schema';

export const Owner: unique symbol = Symbol('owner');

export abstract class RoomObject extends BufferObject {
	id!: string;
	pos!: RoomPosition.RoomPosition;
	effects!: any[];
	room!: Room;

	abstract get [Variant](): string;
	[Process]?: ProcessorSpecification<this>['process'];
	[Tick]?: ProcessorSpecification<this>['tick'];
}

export function chainIntentChecks(...checks: (() => number)[]) {
	for (const check of checks) {
		const result = check();
		if (result !== C.OK) {
			return result;
		}
	}
	return C.OK;
}
