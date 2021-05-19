import type { Room } from 'xxscreeps/game/room';
import * as C from 'xxscreeps/game/constants';
import { Game } from 'xxscreeps/game';
import { Structure, structureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';

export const format = () => compose(shape, StructureController);
const shape = declare('Controller', struct(structureFormat, {
	...variant('controller'),
	isPowerEnabled: 'bool',
	// reservation: { username, ticksToEnd }
	safeModeAvailable: 'int32',
	'#downgradeTime': 'int32',
	'#progress': 'int32',
	'#safeModeCooldownTime': 'int32',
	'#upgradeBlockedUntil': 'int32',
}));

export class StructureController extends withOverlay(Structure, shape) {
	['#upgradePowerThisTick']: number | undefined;
	get hits() { return undefined as never }
	get hitsMax() { return undefined as never }
	get level() { return this.room['#level'] }
	get progress() { return this.level > 0 ? this['#progress'] : undefined }
	get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined }
	get safeMode() { return Math.max(0, this.room['#safeModeUntil'] - Game.time) || undefined }
	get safeModeCooldown() { return Math.max(0, this['#safeModeCooldownTime'] - Game.time) || undefined }
	get structureType() { return C.STRUCTURE_CONTROLLER }
	get ticksToDowngrade() { return this['#downgradeTime'] === 0 ? undefined : Math.max(0, this['#downgradeTime'] - Game.time) }
	get upgradeBlocked() { return Math.max(0, this['#upgradeBlockedUntil'] - Game.time) || undefined }

	/**
	 * An object with the controller sign info if present
	 */
	get sign() {
		const value = this.room['#sign'] ? {
			datetime: new Date(this.room['#sign'].datetime),
			text: this.room['#sign'].text,
			time: this.room['#sign'].time,
			username: '',
		} : null;
		Object.defineProperty(this, 'sign', { value });
		return value;
	}

	/**
	 * Activate safe mode if available.
	 */
	activateSafeMode() {
		console.log('TODO: activateSafeMode');
	}

	/**
	 * Make your claimed controller neutral again.
	 */
	unclaim() {
		console.log('TODO: unclaim');
	}

	['#afterInsert'](room: Room) {
		super['#afterInsert'](room);
		room.controller = this;
	}

	['#afterRemove'](room: Room) {
		super['#afterRemove'](room);
		room.controller = undefined;
	}
}

declare module 'xxscreeps/game/room/room' {
	interface Room {
		controller?: StructureController;
	}
}
