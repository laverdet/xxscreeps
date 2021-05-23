import './creep';
import * as Controller from './controller';
import * as Id from 'xxscreeps/engine/schema/id';
import { registerEnumerated, registerStruct, registerVariant } from 'xxscreeps/engine/schema';
import { registerGlobal } from 'xxscreeps/game';
import { optional, struct } from 'xxscreeps/schema';

// Register schema
const roomSchema = registerStruct('Room', {
	'#level': 'int32',
	'#safeModeUntil': 'int32',
	'#sign': optional(struct({
		datetime: 'double',
		text: 'string',
		time: 'int32',
		userId: Id.format,
	})),
	'#user': Id.optionalFormat,
});
const controllerSchema = registerVariant('Room.objects', Controller.format);
declare module 'xxscreeps/game/room' {
	interface Schema { controller: [ typeof roomSchema, typeof controllerSchema ] }
}

const actionSchema = registerEnumerated('ActionLog.action', 'reserveController', 'upgradeController');
declare module 'xxscreeps/game/object' {
	interface Schema { controller: typeof actionSchema }
}

// Export `StructureController` to runtime globals
registerGlobal(Controller.StructureController);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureController: typeof Controller.StructureController }
}
