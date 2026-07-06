import type { RoomPosition } from 'xxscreeps/game/position.js';
import { chainIntentChecks, checkSameRoom, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents } from 'xxscreeps/game/index.js';
import { cooldownTime, createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { SingleStore, calculateChecked, checkHasCapacity, checkHasResource } from 'xxscreeps/mods/resource/store.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { linkShape } from './schema.js';

export class StructureLink extends withOverlay(OwnedStructure, linkShape) {
	/**
	 * The amount of game ticks the link has to wait until the next transfer is possible.
	 */
	@enumerable get cooldown() { return cooldownTime(this['#cooldownTime']); }

	/** @deprecated */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY]; }
	/** @deprecated */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }

	override get hitsMax() { return C.LINK_HITS; }
	override get structureType() { return C.STRUCTURE_LINK; }

	/**
	 * Remotely transfer energy to another link at any location in the same room.
	 * @param target The target object.
	 * @param amount The amount of energy to be transferred. If omitted, all the available energy is used.
	 */
	transferEnergy(target: StructureLink, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			amount || Math.min(this.store[C.RESOURCE_ENERGY], target.store.getFreeCapacity(C.RESOURCE_ENERGY)!));
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
