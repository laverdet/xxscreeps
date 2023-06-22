import type { RoomPosition } from 'xxscreeps/game/position.js';
import C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import { OwnedStructure, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { SingleStore, calculateChecked, checkHasCapacity, checkHasResource, singleStoreFormat } from 'xxscreeps/mods/resource/store.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { chainIntentChecks, checkSameRoom, checkTarget } from 'xxscreeps/game/checks.js';

export const format = () => compose(shape, StructureLink);
const shape = declare('Link', struct(ownedStructureFormat, {
	...variant('link'),
	hits: 'int32',
	store: singleStoreFormat(),
	'#actionLog': RoomObject.actionLogFormat,
	'#cooldownTime': 'int32',
}));

export class StructureLink extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.LINK_HITS }
	override get structureType() { return C.STRUCTURE_LINK }

	/**
	 * The amount of game ticks the link has to wait until the next transfer is possible.
	 */
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time) }

	/**
	 * Remotely transfer energy to another link at any location in the same room.
	 * @param target The target object.
	 * @param amount The amount of energy to be transferred. If omitted, all the available energy is used.
	 */
	transferEnergy(target: StructureLink, amount?: number) {
		const intentAmount = calculateChecked(this, target, () =>
			// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
			amount || Math.min(this.store[C.RESOURCE_ENERGY], target.store.getFreeCapacity(C.RESOURCE_ENERGY)));
		return chainIntentChecks(
			() => checkTransferEnergy(this, target, intentAmount),
			() => intents.save(this, 'transferEnergy', target.id, intentAmount));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const link = assign(RoomObject.create(new StructureLink, pos), {
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
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.link : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

export function checkTransferEnergy(link: StructureLink, target: StructureLink, amount: number) {
	return chainIntentChecks(
		() => checkMyStructure(link, StructureLink),
		() => checkTarget(target, StructureLink),
		() => checkHasResource(link, C.RESOURCE_ENERGY, amount),
		() => checkHasCapacity(target, C.RESOURCE_ENERGY, amount),
		() => checkSameRoom(link, target),
		() => {
			if (link.cooldown) {
				return C.ERR_TIRED;
			} else if (link.room !== target.room) {
				return C.ERR_NOT_IN_RANGE;
			}
		},
	);
}
