import { declare, inherit, variant, withSymbol } from '~/lib/schema';
import { DowngradeTime, Progress, StructureController, UpgradeBlockedTime } from '~/game/objects/structures/controller';
import * as Structure from './structure';

export const shape = declare('Controller', {
	...inherit(Structure.format),
	...variant('controller'),

	downgradeTime: withSymbol(DowngradeTime, 'int32'),
	isPowerEnabled: 'bool',
	level: 'int32',
	progress: withSymbol(Progress, 'int32'),
	// reservation: { username, ticksToEnd }
	safeMode: 'int32',
	safeModeAvailable: 'int32',
	safeModeCooldown: 'int32',
	// sign: { username, text, time, datetime }
	upgradeBlockedTime: withSymbol(UpgradeBlockedTime, 'int32'),
});

export const format = declare(shape, { overlay: StructureController });
