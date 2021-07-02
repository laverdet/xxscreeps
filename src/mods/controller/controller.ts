import type { Room } from 'xxscreeps/game/room';
import * as C from 'xxscreeps/game/constants';
import { Game, intents, userInfo } from 'xxscreeps/game';
import { OwnedStructure, checkMyStructure, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { chainIntentChecks } from 'xxscreeps/game/checks';

export const format = declare('Controller', () => compose(shape, StructureController));
const shape = struct(ownedStructureFormat, {
	...variant('controller'),
	isPowerEnabled: 'bool',
	safeModeAvailable: 'int32',
	'#downgradeTime': 'int32',
	'#progress': 'int32',
	'#reservationEndTime': 'int32',
	'#safeModeCooldownTime': 'int32',
	'#upgradeBlockedUntil': 'int32',
});

export class StructureController extends withOverlay(OwnedStructure, shape) {
	/** @internal */
	declare upgradePowerThisTick?: number;
	override get hits() { return undefined as never }
	override get hitsMax() { return undefined as never }
	@enumerable get level() { return this.room['#level'] }
	@enumerable get progress() { return this.level > 0 ? this['#progress'] : undefined }
	@enumerable get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined }
	@enumerable get safeMode() { return Math.max(0, this.room['#safeModeUntil'] - Game.time) || undefined }
	@enumerable get safeModeCooldown() { return Math.max(0, this['#safeModeCooldownTime'] - Game.time) || undefined }
	override get structureType() { return C.STRUCTURE_CONTROLLER }
	@enumerable get ticksToDowngrade() { return this['#downgradeTime'] === 0 ? undefined : Math.max(0, this['#downgradeTime'] - Game.time) }
	@enumerable get upgradeBlocked() { return Math.max(0, this['#upgradeBlockedUntil'] - Game.time) || undefined }

	/**
	 * An object with the controller reservation info if present
	 */
	@enumerable get reservation() {
		const ticksToEnd = this['#reservationEndTime'] - Game.time;
		const value = ticksToEnd > 0 ? {
			ticksToEnd,
			username: userInfo.get(this.room['#user']!)!.username,
		} : undefined;
		Object.defineProperty(this, 'reservation', { value });
		return value;
	}

	/**
	 * An object with the controller sign info if present
	 */
	@enumerable get sign() {
		const sign = this.room['#sign'];
		const value = sign ? {
			datetime: new Date(sign.datetime),
			text: sign.text,
			time: sign.time,
			username: userInfo.get(sign.userId)!.username,
		} : undefined;
		Object.defineProperty(this, 'sign', { value });
		return value;
	}

	/**
	 * Activate safe mode if available.
	 */
	activateSafeMode() {
		return chainIntentChecks(
			() => checkActivateSafeMode(this),
			() => intents.save(this, 'activateSafeMode'));
	}

	/**
	 * Make your claimed controller neutral again.
	 */
	unclaim() {
		return chainIntentChecks(
			() => checkUnclaim(this),
			() => intents.save(this, 'unclaim'));
	}

	override ['#afterInsert'](room: Room) {
		super['#afterInsert'](room);
		room.controller = this;
	}

	override ['#beforeRemove']() {
		this.room.controller = undefined;
		super['#beforeRemove']();
	}

	override get ['#extraUsers']() {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const sign = this.room?.['#sign'];
		return sign ? [ sign.userId ] : [];
	}
}

declare module 'xxscreeps/game/room' {
	interface Room {
		controller?: StructureController;
	}
}

export function checkActivateSafeMode(controller: StructureController) {
	return chainIntentChecks(
		() => checkMyStructure(controller, StructureController),
		() => {
			if (controller.safeModeAvailable <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			} else if (controller.safeModeCooldown) {
				return C.ERR_TIRED;
			} else if (controller.safeMode) {
				return C.ERR_BUSY;
			}
		});
}

export function checkUnclaim(controller: StructureController) {
	return checkMyStructure(controller, StructureController);
}
