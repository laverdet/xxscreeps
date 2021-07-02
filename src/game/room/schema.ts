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
			// Users who can issue intents in this room
			intents: vector(Id.format),
			// Users who have active objects in this room
			presence: vector(Id.format),
			// Users who can see into this room
			vision: vector(Id.format),
			// Users needed for rendering, for example signed controller
			extra: vector(Id.format),
		}),
		'#eventLog': vector(variant(...variantForPath<Schema>()('Room.eventLog'))),
	}));
}
