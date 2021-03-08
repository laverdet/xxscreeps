import * as Container from './container';
import * as Resource from './resource';
import { registerSchema } from 'xxscreeps/engine/schema';

// These need to be declared separately I guess
const schema = registerSchema('Room.objects', Container.format);
const schema2 = registerSchema('Room.objects', Resource.format);

declare module 'xxscreeps/engine/schema' {
	interface Schema {
		resource: [ typeof schema, typeof schema2 ];
	}
}
