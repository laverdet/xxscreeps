import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';
import { DowngradeTime, Progress, StructureController, UpgradeBlockedTime } from '~/game/objects/structures/controller';
import * as Structure from './structure';

export { StructureController };

export const format = withType<StructureController>(checkCast<Format>()({
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
}));

export const interceptors = {
	StructureController: checkCast<Interceptor>()({
		overlay: StructureController,
		members: {
			downgradeTime: { symbol: DowngradeTime },
			progress: { symbol: Progress },
			upgradeBlockedTime: { symbol: UpgradeBlockedTime },
		},
	}),
};

export const schemaFormat = { StructureController: format };
