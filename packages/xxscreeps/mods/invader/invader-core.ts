import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { chainIntentChecks, checkSameRoom, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { StructureTower } from 'xxscreeps/mods/defense/tower.js';
import { OwnedStructure, checkMyStructure, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

export const format = declare('InvaderCore', () => compose(shape, StructureInvaderCore));
const shape = struct(ownedStructureFormat, {
	...variant('invaderCore'),
	hits: 'int32',
	level: 'int8',
	'#actionLog': RoomObject.actionLogFormat,
	'#collapseTime': 'int32',
	'#deployTime': 'int32',
});

/**
 * Non-player structure. Spawns NPC invader creeps that defend a stronghold core. Cannot be
 * destroyed by player intents; takes no damage while deploying because of a natural
 * `EFFECT_INVULNERABILITY` produced by the deploy timer.
 */
export class StructureInvaderCore extends withOverlay(OwnedStructure, shape) {
	@enumerable override get effects(): RoomObject.RoomObjectEffect[] | undefined {
		const { ticksToDeploy } = this;
		const ticksToCollapse = RoomObject.optionalExpiryTime(Game, this['#collapseTime']);
		const effects = [
			...ticksToDeploy === undefined ? [] : [ { effect: C.EFFECT_INVULNERABILITY, ticksRemaining: ticksToDeploy } ],
			...ticksToCollapse === undefined ? [] : [ { effect: C.EFFECT_COLLAPSE_TIMER, ticksRemaining: ticksToCollapse } ],
		];
		return effects.length === 0 ? undefined : effects;
	}

	// TODO: stronghold spawning
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	@enumerable get spawning(): null { return null; }

	@enumerable get ticksToDeploy(): number | undefined {
		return RoomObject.optionalExpiryTime(Game, this['#deployTime']);
	}

	override get hitsMax(): number {
		return C.INVADER_CORE_HITS;
	}

	override get structureType() { return C.STRUCTURE_INVADER_CORE; }

	override get '#invulnerable'() {
		return this.ticksToDeploy !== undefined;
	}

	/**
	 * Block claim/reservation of the target controller.
	 * @param target Neutral or invader-reserved controller in the same room.
	 */
	reserveController(target: StructureController) {
		return chainIntentChecks(
			() => checkReserveController(this, target),
			() => intents.save(this, 'reserveController', target.id));
	}

	/**
	 * Reduce a hostile controller's downgrade/reservation timer.
	 */
	attackController(target: StructureController) {
		return chainIntentChecks(
			() => checkAttackController(this, target),
			() => intents.save(this, 'attackController', target.id));
	}

	/**
	 * Reset the downgrade timer on a controller already owned by this NPC.
	 */
	upgradeController(target: StructureController) {
		return chainIntentChecks(
			() => checkUpgradeController(this, target),
			() => intents.save(this, 'upgradeController', target.id));
	}

	/**
	 * Push energy into a tower or creep in the same room. `amount` defaults to the target's free
	 * capacity for energy; oversized amounts clamp at the processor. The stronghold refill
	 * behaviors are this action's driver and arrive in a later slice.
	 */
	transferEnergy(target: StructureTower | Creep, amount?: number) {
		return chainIntentChecks(
			() => checkTransferEnergy(this, target),
			() => intents.save(this, 'transferEnergy', target.id,
				amount ?? target.store.getFreeCapacity(C.RESOURCE_ENERGY)!));
	}

	override '#applyDamage'(power: number, type: number, source?: RoomObject.RoomObject) {
		if (this['#invulnerable']) {
			return;
		}
		super['#applyDamage'](power, type, source);
	}

	override '#beforeInsert'(room: Room) {
		super['#beforeInsert'](room);
		// Keep NPC '2' active in any room that hosts a core; inlined to avoid pulling the
		// processor entry-point into the runtime sandbox.
		room['#npcData'].users.add('2');
	}
}

export function create(pos: RoomPosition, level: number, deployTime: number) {
	const core = assign(RoomObject.create(new StructureInvaderCore(), pos), {
		hits: C.INVADER_CORE_HITS,
		level,
	});
	core['#user'] = '2';
	core['#deployTime'] = deployTime;
	return core;
}

// Block invader-core intents whose source was destroyed earlier in the same intent pass,
// before `#flushObjects` removes the core from the object map.
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
