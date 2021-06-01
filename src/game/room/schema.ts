import type { Schema } from '.';
import * as Id from 'xxscreeps/engine/schema/id';
import { compose, declare, struct, variant, vector } from 'xxscreeps/schema';
import { structForPath, variantForPath } from 'xxscreeps/engine/schema';
import { Room } from './room';

// Schema definition
export const format = declare('Room', () => compose(shape, Room));
export const objectFormat = declare('AnyObject', () => variant(...variantForPath<Schema>()('Room.objects')));
export function shape() {
	return struct(structForPath<Schema>()('Room', {
		name: 'string',
		'#objects': vector(objectFormat),
		'#users': struct({
			intents: vector(Id.format),
			presence: vector(Id.format),
			vision: vector(Id.format),
		}),
		'#eventLog': vector(variant(...variantForPath<Schema>()('Room.eventLog'))),
	}));
}
