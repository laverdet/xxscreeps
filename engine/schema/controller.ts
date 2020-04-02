import { bindInterceptors, withSymbol, Inherit, Variant } from '~/lib/schema';
import { DowngradeTime, Progress, StructureController, UpgradeBlockedTime } from '~/game/objects/structures/controller';
import * as Structure from './structure';

export const shape = bindInterceptors('Controller', {
	[Inherit]: Structure.format,
	[Variant]: 'controller',

	downgradeTime: 'int32',
	isPowerEnabledboolean: 'bool',
	level: 'int32',
	progress: 'int32',
	// reservation: { username, ticksToEnd }
	safeMode: 'int32',
	safeModeAvailable: 'int32',
	safeModeCooldown: 'int32',
	// sign: { username, text, time, datetime }
	upgradeBlockedTime: 'int32',
}, {
	members: {
		downgradeTime: withSymbol(DowngradeTime),
		progress: withSymbol(Progress),
		upgradeBlockedTime: withSymbol(UpgradeBlockedTime),
	},
});

export const format = bindInterceptors(shape, { overlay: StructureController });
