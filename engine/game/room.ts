import { BufferObject } from '~/engine/schema/buffer-object';
import { makeVariant, makeVector } from '~/engine/schema/format';

import * as Creep from '~/engine/game/creep';
import * as Source from '~/engine/game/source';

export const format = {
	name: 'string' as const,
	objects: makeVector(makeVariant(
		Creep.format,
		Source.format,
	)),
};

export class Room extends BufferObject {
	name!: string;
}
