import type { RoomObjectEffect } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, hooks, intents, userInfo } from 'xxscreeps/game/index.js';
import { optionalExpiryTime, untilTime } from 'xxscreeps/game/object.js';
import { OwnedStructure, checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { controllerShape } from './schema.js';

/**
 * Claim this structure to take control over the room. The controller structure cannot be damaged or
 * destroyed.
 *
 * It can be addressed by [`Room.controller`](https://docs.screeps.com/api/#Room.controller)
 * property.
 * @public
 * @see https://docs.screeps.com/api/#StructureController
 */
export class StructureController extends withOverlay(OwnedStructure, controllerShape) {
	/** @internal */
	declare upgradePowerThisTick?: number;

	/**
	 * Current controller level, from 0 to 8.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.level
	 */
	@enumerable get level() { return this.room['#level']; }

	/**
	 * The current progress of upgrading the controller to the next level.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.progress
	 */
	@enumerable get progress() { return this.level > 0 ? this['#progress'] : undefined; }

	/**
	 * The progress needed to reach the next level.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.progressTotal
	 */
	@enumerable get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined; }

	/**
	 * How many ticks of safe mode remaining, or undefined.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.safeMode
	 */
	@enumerable get safeMode() { return untilTime(this.room['#safeModeUntil']); }

	/**
	 * During this period in ticks new safe mode activations will be blocked, undefined if cooldown is
	 * inactive.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.safeModeCooldown
	 */
	@enumerable get safeModeCooldown() { return untilTime(this['#safeModeCooldownTime']); }

	/**
	 * The amount of game ticks when this controller will lose one level. This timer is set to 50% on
	 * level upgrade or downgrade, and it can be increased by using
	 * [`Creep.upgradeController`](https://docs.screeps.com/api/#Creep.upgradeController). Must be
	 * full to upgrade the controller to the next level.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.ticksToDowngrade
	 */
	@enumerable get ticksToDowngrade() { return optionalExpiryTime(this['#downgradeTime']); }

	/**
	 * The amount of game ticks while this controller cannot be upgraded due to attack. Safe mode is
	 * also unavailable during this period.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.upgradeBlocked
	 */
	@enumerable get upgradeBlocked() { return untilTime(this['#upgradeBlockedUntil']); }

	/**
	 * An object with the controller reservation info if present: `username` — the name of a player
	 * who reserved this controller; `ticksToEnd` — the amount of game ticks when the reservation will
	 * end.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.reservation
	 */
	@enumerable get reservation() {
		const ticksToEnd = optionalExpiryTime(this['#reservationEndTime']);
		const value = ticksToEnd === undefined ? undefined : {
			ticksToEnd,
			username: userInfo.get(this.room['#user']!)!.username,
		};
		Object.defineProperty(this, 'reservation', { value });
		return value;
	}

	/**
	 * An object with the controller sign info if present: `username` — the name of a player who
	 * signed this controller; `text` — the sign text; `time` — the sign time in game ticks;
	 * `datetime` — the sign real date.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.sign
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
	 * Applied effects, an array of objects with the following properties: `effect` (effect ID of the
	 * applied effect, can be either natural effect ID or Power ID), `level` (power level of the
	 * applied effect, absent if the effect is not a Power effect), and `ticksRemaining` (how many
	 * ticks will the effect last).
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.effects
	 */
	@enumerable override get effects(): RoomObjectEffect[] | undefined {
		const ticksRemaining = optionalExpiryTime(this['#upgradeInvulnerableUntil']);
		return ticksRemaining === undefined ? undefined : [ { effect: C.EFFECT_INVULNERABILITY, ticksRemaining } ];
	}

	/**
	 * The controller structure cannot be damaged or destroyed, so this is always undefined.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.hits
	 */
	override get hits() { return undefined; }

	/**
	 * The controller structure cannot be damaged or destroyed, so this is always undefined.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.hitsMax
	 */
	override get hitsMax() { return undefined; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.structureType
	 */
	override get structureType() { return C.STRUCTURE_CONTROLLER; }
	override get '#extraUsers'() {
		const sign = this.room['#sign'];
		return sign ? [ sign.userId ] : [];
	}

	/**
	 * Activate safe mode if available.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_BUSY`,
	 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_TIRED`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.activateSafeMode
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
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.unclaim
	 */
	unclaim() {
		return chainIntentChecks(
			() => checkUnclaim(this),
			() => intents.save(this, 'unclaim'));
	}

	override '#afterRemove'() {
		this.room.controller = undefined;
		super['#afterRemove']();
	}

	override '#beforeInsert'(room: Room) {
		super['#beforeInsert'](room);
		room.controller = this;
	}
}

declare module 'xxscreeps/game/room/index.js' {
	interface Room {
		/**
		 * The Controller structure of this room, if present, otherwise undefined.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.controller
		 */
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
			const downgradeThreshold = C.CONTROLLER_DOWNGRADE[controller.level]! / 2 -
				C.CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD;
			if (
				Boolean(controller.safeModeCooldown) ||
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
