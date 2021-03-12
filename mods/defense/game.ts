import * as Tower from './tower';
import { registerSchema } from 'xxscreeps/engine/schema';

// Register schema
const schema = registerSchema('Room.objects', Tower.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		defense: typeof schema;
	}
}
