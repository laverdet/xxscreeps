import { declare, inherit, variant } from '~/lib/schema';
import { StructureController } from '~/game/objects/structures/controller';
import * as Structure from './structure';

export const shape = declare('Controller', {
	...inherit(Structure.format),
	...variant('controller'),
	isPowerEnabled: 'bool',
	level: 'int32',
	// reservation: { username, ticksToEnd }
	safeMode: 'int32',
	safeModeAvailable: 'int32',
	safeModeCooldown: 'int32',
	// sign: { username, text, time, datetime }
	_downgradeTime: 'int32',
	_progress: 'int32',
	_upgradeBlockedTime: 'int32',
});

export const format = declare(shape, { overlay: StructureController });
