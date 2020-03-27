import * as Structure from '.';
import * as C from '~/game/constants';
import { checkCast, withType, Format, Inherit, Interceptor, Variant } from '~/lib/schema';

export const DowngradeTime = Symbol('downgradeTime');
export const Progress = Symbol('progress');
export const UpgradeBlockedTime = Symbol('upgradeBlockedTime');
export const UpgradePowerThisTick = Symbol('UpgradePowerThisTick');

export class StructureController extends Structure.Structure {
	get [Variant]() { return 'controller' }
	get progress() { return this.level > 0 ? this[Progress] : undefined }
	get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined }
	get structureType() { return C.STRUCTURE_CONTROLLER }
	get ticksToDowngrade() { return this[DowngradeTime] === 0 ? undefined : this[DowngradeTime] - Game.time }
	get upgradeBlocked() {
		if (this[UpgradeBlockedTime] === 0 || this[UpgradeBlockedTime] > Game.time) {
			return undefined;
		} else {
			return Game.time - this[UpgradeBlockedTime];
		}
	}

	isPowerEnabledboolean!: number;
	level!: number;
	safeMode!: number;
	safeModeAvailable!: number;
	safeModeCooldown!: number;

	[DowngradeTime]: number;
	[Progress]!: number;
	[UpgradeBlockedTime]!: number;
	[UpgradePowerThisTick]?: number; // used by processor only. not saved in schema.
}

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
