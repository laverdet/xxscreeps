import * as C from 'xxscreeps/game/constants/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { declare, enumerated, struct, vector } from 'xxscreeps/schema/index.js';

/** @internal */
export const powerCreepShape = declare('PowerCreep', struct(roomObjectShape, {
	name: 'string',
	className: enumerated(...Object.values(C.POWER_CLASS)),
	'#powers': vector(struct({ power: 'int8', level: 'int8' })),
	spawnCooldownTime: 'double',
	deleteTime: 'double',
}));
