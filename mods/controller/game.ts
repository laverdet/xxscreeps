import * as Controller from './controller';
import { registerSchema } from 'xxscreeps/engine/schema';

// Register schema
const schema = registerSchema('Room.objects', Controller.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		controller: typeof schema;
	}
}
