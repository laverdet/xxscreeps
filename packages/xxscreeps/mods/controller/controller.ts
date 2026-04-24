import type { Room } from 'xxscreeps/game/room/index.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, hooks, intents, userInfo } from 'xxscreeps/game/index.js';
import { OwnedStructure, checkMyStructure, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';

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
	@enumerable get level() { return this.room['#level']; }
	@enumerable get progress() { return this.level > 0 ? this['#progress'] : undefined; }
	@enumerable get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined; }
	@enumerable get safeMode() { return Math.max(0, this.room['#safeModeUntil'] - Game.time) || undefined; }
	@enumerable get safeModeCooldown() { return Math.max(0, this['#safeModeCooldownTime'] - Game.time) || undefined; }
	@enumerable get ticksToDowngrade() { return this['#downgradeTime'] === 0 ? undefined : Math.max(0, this['#downgradeTime'] - Game.time); }
	@enumerable get upgradeBlocked() { return Math.max(0, this['#upgradeBlockedUntil'] - Game.time) || undefined; }

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

	override get hits() { return undefined; }
	override get hitsMax() { return undefined; }
	override get structureType() { return C.STRUCTURE_CONTROLLER; }
	override get '#extraUsers'() {
		const sign = this.room?.['#sign'];
		return sign ? [ sign.userId ] : [];
	}

	/**
	 * Activate safe mode if available.
	 */
	activateSafeMode() {
		return chainIntentChecks(
			() => checkActivateSafeMode(this),
			() => {
				// Runtime-only world-wide scan; the processor's Game.rooms has only the target room.
				for (const room of Object.values(Game.rooms)) {
					const other = room.controller;
					if (other?.my && other.safeMode !== undefined) {
						return C.ERR_BUSY;
					}
				}
			},
			() => {
				// Cap to one activateSafeMode intent per tick; safeMode only flips in the processor.
				if (lastActivateSafeModeId !== undefined && lastActivateSafeModeId !== this.id) {
					const previous = Game.getObjectById<StructureController>(lastActivateSafeModeId);
					if (previous) {
						intents.remove(previous, 'activateSafeMode');
					}
				}
				lastActivateSafeModeId = this.id;
				return intents.save(this, 'activateSafeMode');
			});
	}

	/**
	 * Make your claimed controller neutral again.
	 */
	unclaim() {
		return chainIntentChecks(
			() => checkUnclaim(this),
			() => intents.save(this, 'unclaim'));
	}

	override '#afterInsert'(room: Room) {
		super['#afterInsert'](room);
		room.controller = this;
	}

	override '#beforeRemove'() {
		this.room.controller = undefined;
		super['#beforeRemove']();
	}
}

declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		controller?: StructureController | undefined;
	}
}

let lastActivateSafeModeId: string | undefined;
hooks.register('gameInitializer', () => {
	lastActivateSafeModeId = undefined;
});

export function checkActivateSafeMode(controller: StructureController) {
	return chainIntentChecks(
		() => checkMyStructure(controller, StructureController),
		() => {
			if (controller.safeModeAvailable <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
			const downgradeThreshold = C.CONTROLLER_DOWNGRADE[controller.level]! / 2
				- C.CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD;
			if (
				controller.safeModeCooldown ||
				controller.upgradeBlocked !== undefined ||
				(controller.ticksToDowngrade ?? Infinity) < downgradeThreshold
			) {
				return C.ERR_TIRED;
			}
			if (controller.safeMode !== undefined) {
				return C.ERR_BUSY;
			}
		});
}

export function checkUnclaim(controller: StructureController) {
	return checkMyStructure(controller, StructureController);
}
