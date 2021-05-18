import './creep';
import * as Controller from './controller';
import { registerSchema } from 'xxscreeps/engine/schema';
import { registerGlobal } from 'xxscreeps/game';
import { enumerated } from 'xxscreeps/schema';

// Register schema
const schema = [
	registerSchema('ActionLog.action', enumerated('upgradeController')),

	registerSchema('Room.objects', Controller.format),
];
declare module 'xxscreeps/engine/schema' {
	interface Schema {
		controller: typeof schema;
	}
}

// Export `StructureController` to runtime globals
registerGlobal(Controller.StructureController);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureController: typeof Controller.StructureController }
}
