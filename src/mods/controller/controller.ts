import type { Room } from 'xxscreeps/game/room';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import * as RoomObject from 'xxscreeps/game/object';
import { Game } from 'xxscreeps/game';
import { Structure, structureFormat } from 'xxscreeps/mods/structure/structure';
import { XSymbol, compose, declare, optional, struct, variant, withOverlay } from 'xxscreeps/schema';

export const DowngradeTime = XSymbol('downgradeTime');
export const Progress = XSymbol('progress');
export const UpgradeBlockedTime = XSymbol('upgradeBlockedTime');
export const UpgradePowerThisTick = XSymbol('upgradePowerThisTick');

export const format = () => compose(shape, StructureController);
const shape = declare('Controller', struct(structureFormat, {
	...variant('controller'),
	isPowerEnabled: 'bool',
	level: 'int32',
	// reservation: { username, ticksToEnd }
	safeMode: 'int32',
	safeModeAvailable: 'int32',
	safeModeCooldown: 'int32',
	_sign: optional(struct({
		datetime: 'double',
		text: 'string',
		time: 'int32',
		userId: Id.format,
	})),
	[DowngradeTime]: 'int32',
	[Progress]: 'int32',
	[UpgradeBlockedTime]: 'int32',
}));

export class StructureController extends withOverlay(Structure, shape) {
	[UpgradePowerThisTick]: number | undefined;
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

	/**
	 * An object with the controller sign info if present
	 */
	get sign() {
		const value = this._sign ? {
			datetime: new Date(this._sign.datetime),
			text: this._sign.text,
			time: this._sign.time,
			username: '',
		} : null;
		Object.defineProperty(this, 'sign', { value });
		return value;
	}

	[RoomObject.AfterInsert](room: Room) {
		super[RoomObject.AfterInsert](room);
		room.controller = this;
	}

	[RoomObject.AfterRemove](room: Room) {
		super[RoomObject.AfterRemove](room);
		room.controller = undefined;
	}

	[RoomObject.RunnerUser]() {
		return this.level > 0 ? this[RoomObject.Owner] : null;
	}
}

declare module 'xxscreeps/game/room/room' {
	interface Room {
		controller?: StructureController;
	}
}
