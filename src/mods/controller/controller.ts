import type { Room } from 'xxscreeps/game/room';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import { Game } from 'xxscreeps/game';
import { Structure, structureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, optional, struct, variant, withOverlay } from 'xxscreeps/schema';

export const format = () => compose(shape, StructureController);
const shape = declare('Controller', struct(structureFormat, {
	...variant('controller'),
	isPowerEnabled: 'bool',
	level: 'int32',
	// reservation: { username, ticksToEnd }
	safeMode: 'int32',
	safeModeAvailable: 'int32',
	safeModeCooldown: 'int32',
	'#downgradeTime': 'int32',
	'#progress': 'int32',
	'#sign': optional(struct({
		datetime: 'double',
		text: 'string',
		time: 'int32',
		userId: Id.format,
	})),
	'#upgradeBlockedTime': 'int32',
}));

export class StructureController extends withOverlay(Structure, shape) {
	['#upgradePowerThisTick']: number | undefined;
	get progress() { return this.level > 0 ? this['#progress'] : undefined }
	get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined }
	get structureType() { return C.STRUCTURE_CONTROLLER }
	get ticksToDowngrade() { return this['#downgradeTime'] === 0 ? undefined : this['#downgradeTime'] - Game.time }
	get upgradeBlocked() {
		if (this['#upgradeBlockedTime'] === 0 || this['#upgradeBlockedTime'] > Game.time) {
			return undefined;
		} else {
			return Game.time - this['#upgradeBlockedTime'];
		}
	}

	/**
	 * An object with the controller sign info if present
	 */
	get sign() {
		const value = this['#sign'] ? {
			datetime: new Date(this['#sign'].datetime),
			text: this['#sign'].text,
			time: this['#sign'].time,
			username: '',
		} : null;
		Object.defineProperty(this, 'sign', { value });
		return value;
	}

	['#afterInsert'](room: Room) {
		super['#afterInsert'](room);
		room.controller = this;
	}

	['#afterRemove'](room: Room) {
		super['#afterRemove'](room);
		room.controller = undefined;
	}

	['#runnerUser']() {
		return this.level > 0 ? this['#user'] : null;
	}
}

declare module 'xxscreeps/game/room/room' {
	interface Room {
		controller?: StructureController;
	}
}
