import type { RoomObject, RoomObjectEffect } from 'xxscreeps/game/object.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { PartType } from 'xxscreeps/mods/classic/creep/creep.js';
import { chainIntentChecks, checkSameRoom, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, registerGlobal } from 'xxscreeps/game/index.js';
import { createRoomObject, optionalExpiryTime, requiredExpiryTime } from 'xxscreeps/game/object.js';
import { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
import { Creep } from 'xxscreeps/mods/classic/creep/creep.js';
import { StructureTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { OwnedStructure, checkMyStructure } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { invaderCoreShape } from './schema.js';

/**
 * This NPC structure is a control center of NPC Strongholds, and also rules all invaders in the
 * sector. It spawns NPC defenders of the stronghold, refill towers, repairs structures. While it's
 * alive, it will spawn invaders in all rooms in the same sector. It also contains some valuable
 * resources inside, which you can loot from its ruin if you destroy the structure.
 *
 * An Invader Core has two lifetime stages: deploy stage and active stage. When it appears in a
 * random room in the sector, it has `ticksToDeploy` property, public ramparts around it, and
 * doesn't perform any actions. While in this stage it's invulnerable to attacks (has
 * `EFFECT_INVULNERABILITY` enabled). When the `ticksToDeploy` timer is over, it spawns structures
 * around it and starts spawning creeps, becomes vulnerable, and receives `EFFECT_COLLAPSE_TIMER`
 * which will remove the stronghold when this timer is over.
 * @public
 * @see https://docs.screeps.com/api/#StructureInvaderCore
 */
export class StructureInvaderCore extends withOverlay(OwnedStructure, invaderCoreShape) {
	@enumerable override get effects(): RoomObjectEffect[] | undefined {
		const { ticksToDeploy } = this;
		const ticksToCollapse = optionalExpiryTime(this['#collapseTime']);
		const effects = [
			...ticksToDeploy === undefined ? [] : [ { effect: C.EFFECT_INVULNERABILITY, ticksRemaining: ticksToDeploy } ],
			...ticksToCollapse === undefined ? [] : [ { effect: C.EFFECT_COLLAPSE_TIMER, ticksRemaining: ticksToCollapse } ],
		];
		return effects.length === 0 ? undefined : effects;
	}

	/**
	 * Shows the timer for a not yet deployed stronghold, undefined otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureInvaderCore.ticksToDeploy
	 */
	@enumerable get ticksToDeploy(): number | undefined {
		const deployTime = this['#deployTime'];
		return deployTime === 0 ? undefined : requiredExpiryTime(deployTime + 1) - 1;
	}

	override get hitsMax(): number {
		return C.INVADER_CORE_HITS;
	}

	override get structureType() { return C.STRUCTURE_INVADER_CORE; }

	override get '#invulnerable'() {
		return this.ticksToDeploy !== undefined;
	}

	// These four actions are NPC-internal — only the invader loop calls them — so they're private
	// rather than part of the player-facing structure API.

	/**
	 * Block claim/reservation of the target controller.
	 * @param target Neutral or invader-reserved controller in the same room.
	 */
	'#reserveController'(target: StructureController) {
		return chainIntentChecks(
			() => checkReserveController(this, target),
			() => intents.save(this, 'reserveController', target.id));
	}

	/**
	 * Reduce a hostile controller's downgrade/reservation timer.
	 */
	'#attackController'(target: StructureController) {
		return chainIntentChecks(
			() => checkAttackController(this, target),
			() => intents.save(this, 'attackController', target.id));
	}

	/**
	 * Reset the downgrade timer on a controller already owned by this NPC.
	 */
	'#upgradeController'(target: StructureController) {
		return chainIntentChecks(
			() => checkUpgradeController(this, target),
			() => intents.save(this, 'upgradeController', target.id));
	}

	/**
	 * Push energy into a tower or creep in the same room. `amount` defaults to the target's free
	 * capacity for energy; oversized amounts clamp at the processor. The stronghold refill
	 * behaviors are this action's driver and arrive in a later slice.
	 */
	'#transferEnergy'(target: StructureTower | Creep, amount?: number) {
		return chainIntentChecks(
			() => checkTransferEnergy(this, target),
			() => intents.save(this, 'transferEnergy', target.id,
				amount ?? target.store.getFreeCapacity(C.RESOURCE_ENERGY)!));
	}

	/**
	 * Incubate an NPC defender on the core's own tile. The spawn takes
	 * `INVADER_CORE_CREEP_SPAWN_TIME[level]` ticks per body part and materializes on an adjacent
	 * tile once it elapses. The stronghold population behaviors that supply bodies and boosts arrive
	 * in a later slice.
	 */
	'#createCreep'(body: PartType[], name: string) {
		return chainIntentChecks(
			() => checkCreateCreep(this),
			() => intents.save(this, 'createCreep', body, name));
	}

	override '#applyDamage'(power: number, type: number, source?: RoomObject) {
		if (this['#invulnerable']) {
			return;
		}
		super['#applyDamage'](power, type, source);
	}
}

// Callers insert the returned core and are responsible for waking the invader NPC that drives it
// (`activateNPC(room, '2')` + `context.setActive()`), the same way `requestInvader` does for creeps.
export function create(pos: RoomPosition, level: number, deployTime: number) {
	const core = assign(createRoomObject(new StructureInvaderCore(), pos), {
		hits: C.INVADER_CORE_HITS,
		level,
	});
	core['#user'] = '2';
	core['#deployTime'] = deployTime;
	return core;
}

// Block invader-core intents whose source was destroyed earlier in the same intent pass,
// before `#flushObjects` removes the core from the object map.
// TODO: Intents check is not the place to do this. Also, do other objects in the game have the same
// condition?
const checkSourceAlive = (core: StructureInvaderCore) =>
	core.hits > 0 ? undefined : C.ERR_INVALID_TARGET;

export function checkReserveController(core: StructureInvaderCore, target: StructureController) {
	return chainIntentChecks(
		() => checkMyStructure(core, StructureInvaderCore),
		() => checkSourceAlive(core),
		() => checkTarget(target, StructureController),
		() => checkSameRoom(core, target),
		() => {
			if (target.level > 0) {
				return C.ERR_INVALID_TARGET;
			}
			if (target['#reservationEndTime'] > Game.time && target.room['#user'] !== '2') {
				return C.ERR_INVALID_TARGET;
			}
		});
}

export function checkAttackController(core: StructureInvaderCore, target: StructureController) {
	return chainIntentChecks(
		() => checkMyStructure(core, StructureInvaderCore),
		() => checkSourceAlive(core),
		() => checkTarget(target, StructureController),
		() => checkSameRoom(core, target),
		() => {
			const reserved = target['#reservationEndTime'] > Game.time;
			const owned = target.level > 0;
			if (!reserved && !owned) {
				return C.ERR_INVALID_TARGET;
			}
			if (owned && target['#user'] === '2') {
				return C.ERR_INVALID_TARGET;
			}
			if (reserved && target.room['#user'] === '2') {
				return C.ERR_INVALID_TARGET;
			}
			if (target.safeMode !== undefined && target['#user'] !== '2') {
				return C.ERR_INVALID_TARGET;
			}
			if (target.upgradeBlocked !== undefined) {
				return C.ERR_TIRED;
			}
		});
}

export function checkUpgradeController(core: StructureInvaderCore, target: StructureController) {
	return chainIntentChecks(
		() => checkMyStructure(core, StructureInvaderCore),
		() => checkSourceAlive(core),
		() => checkTarget(target, StructureController),
		() => checkSameRoom(core, target),
		() => {
			if (target.level === 0 || target['#user'] !== '2') {
				return C.ERR_NOT_OWNER;
			}
			if (target.upgradeBlocked !== undefined) {
				return C.ERR_INVALID_TARGET;
			}
		});
}

// The NPC loop is the only caller and supplies the body/name, so this validates core state only,
// mirroring vanilla's invader core (which never rejects an internal `createCreep` on its arguments).
export function checkCreateCreep(core: StructureInvaderCore) {
	return chainIntentChecks(
		() => checkMyStructure(core, StructureInvaderCore),
		() => checkSourceAlive(core),
		() => core.spawning ? C.ERR_BUSY : C.OK,
		// Only levels with a configured spawn time (2+) field defenders.
		() => (C.INVADER_CORE_CREEP_SPAWN_TIME[core.level] ?? 0) > 0 ? undefined : C.ERR_INVALID_TARGET);
}

export function checkTransferEnergy(core: StructureInvaderCore, target: StructureTower | Creep) {
	return chainIntentChecks(
		() => checkMyStructure(core, StructureInvaderCore),
		() => checkSourceAlive(core),
		() => checkTarget(target, StructureTower, Creep),
		() => checkSameRoom(core, target),
		() => {
			const free = target.store.getFreeCapacity(C.RESOURCE_ENERGY);
			if (free === null) {
				return C.ERR_INVALID_TARGET;
			}
			if (free === 0) {
				return C.ERR_FULL;
			}
		});
}

registerGlobal(StructureInvaderCore);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureInvaderCore: typeof StructureInvaderCore }
}
