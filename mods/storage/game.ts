import * as Storage from './storage';
import { registerSchema } from 'xxscreeps/engine/schema';

// Register schema
const schema = registerSchema('Room.objects', Storage.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		storage: typeof schema;
	}
}
