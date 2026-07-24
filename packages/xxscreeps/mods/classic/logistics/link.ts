import type { RoomPosition } from 'xxscreeps/game/position.js';
import { chainIntentChecks, checkSameRoom, checkTarget } from 'xxscreeps/game/checks.js';
import { intents } from 'xxscreeps/game/index.js';
import { cooldownTime, createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/game.js';
import { SingleStore, calculateChecked, checkHasCapacity, checkHasResource } from 'xxscreeps/mods/classic/resource/store.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { linkShape } from './schema.js';

/**
 * Remotely transfers energy to another Link in the same room.
 * @public
 * @see https://docs.screeps.com/api/#StructureLink
 */
export class StructureLink extends withOverlay(OwnedStructure, linkShape) {
	/**
	 * The amount of game ticks the link has to wait until the next transfer is possible.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureLink.cooldown
	 */
	@enumerable get cooldown() { return cooldownTime(this['#cooldownTime']); }

	/**
	 * An alias for
	 * [`.store[RESOURCE_ENERGY]`](https://docs.screeps.com/api/#StructureExtension.store).
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureLink.energy
	 */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY]; }

	/**
	 * An alias for
	 * [`.store.getCapacity(RESOURCE_ENERGY)`](https://docs.screeps.com/api/#Store.getCapacity).
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureLink.energyCapacity
	 */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }

	override get hitsMax() { return C.LINK_HITS; }
	override get structureType() { return C.STRUCTURE_LINK; }

	/**
	 * Remotely transfer energy to another link at any location in the same room.
	 * @param target The target object.
	 * @param amount The amount of energy to be transferred. If omitted, all the available energy is
	 * used.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_NOT_ENOUGH_RESOURCES`,
	 * `ERR_INVALID_TARGET`, `ERR_FULL`, `ERR_INVALID_ARGS`, `ERR_TIRED`, `ERR_RCL_NOT_ENOUGH`,
	 * `ERR_NOT_IN_RANGE`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureLink.transferEnergy
	 */
	transferEnergy(target: StructureLink, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			(amount ?? 0) || Math.min(this.store[C.RESOURCE_ENERGY], target.store.getFreeCapacity(C.RESOURCE_ENERGY)!));
		return chainIntentChecks(
			() => checkAmount(amount),
			() => checkTransferEnergy(this, target, intentAmount),
			() => intents.save(this, 'transferEnergy', target.id, intentAmount));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const link = assign(createRoomObject(new StructureLink(), pos), {
		hits: C.LINK_HITS,
		store: SingleStore['#create'](C.RESOURCE_ENERGY, C.LINK_CAPACITY),
	});
	link['#user'] = owner;
	return link;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_LINK, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.link : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

function checkAmount(amount: number | undefined) {
	return amount !== undefined && amount < 0 ? C.ERR_INVALID_ARGS : C.OK;
}

function checkNotSelf(source: StructureLink, target: StructureLink) {
	return source === target ? C.ERR_INVALID_TARGET : C.OK;
}

function checkTargetOwner(target: StructureLink) {
	return target.my ? C.OK : C.ERR_NOT_OWNER;
}

function checkCooldown(link: StructureLink) {
	return link.cooldown ? C.ERR_TIRED : C.OK;
}

export function checkTransferEnergy(link: StructureLink, target: StructureLink, amount: number) {
	return chainIntentChecks(
		() => checkTarget(target, StructureLink),
		() => checkNotSelf(link, target),
		() => checkTargetOwner(target),
		() => checkMyStructure(link, StructureLink),
		() => checkCooldown(link),
		() => checkIsActive(link),
		() => checkHasResource(link, C.RESOURCE_ENERGY, amount),
		() => checkHasCapacity(target, C.RESOURCE_ENERGY, amount),
		() => checkSameRoom(link, target),
	);
}
