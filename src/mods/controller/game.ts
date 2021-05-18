import './creep';
import * as Controller from './controller';
import * as Id from 'xxscreeps/engine/schema/id';
import { registerSchema } from 'xxscreeps/engine/schema';
import { registerGlobal } from 'xxscreeps/game';
import { enumerated, struct } from 'xxscreeps/schema';

// Register schema
const schema = [
	registerSchema('ActionLog.action', enumerated('upgradeController')),

	registerSchema('Room', struct({
		'#level': 'int32',
		'#safeModeUntil': 'int32',
		'#user': Id.optionalFormat,
	})),

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
