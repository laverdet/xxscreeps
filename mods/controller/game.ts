import './creep';
import * as Controller from './controller';
import { registerSchema } from 'xxscreeps/engine/schema';
import { registerGlobal } from 'xxscreeps/game';

// Register schema
const schema = registerSchema('Room.objects', Controller.format);
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		controller: typeof schema;
	}
}

// Export `StructureController` to runtime globals
registerGlobal(Controller.StructureController);
