import type { RoomPosition } from 'xxscreeps/game/position.js';
import C from 'xxscreeps/game/constants/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { Game, intents, registerGlobal } from 'xxscreeps/game/index.js';
import { OwnedStructure, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { LabStore, labStoreFormat } from './store.js';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import { checkHasCapacity, checkHasResource } from '../resource/store.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';

export const format = declare('Lab', () => compose(shape, StructureLab));
const shape = struct(ownedStructureFormat, {
	...variant('lab'),
	hits: 'int32',
	store: labStoreFormat,
	'#actionLog': RoomObject.actionLogFormat,
	'#cooldownTime': 'int32',
});

export class StructureLab extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.LAB_HITS }
	override get structureType() { return C.STRUCTURE_LAB }
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time) }
	@enumerable get mineralType() { return this.store['#mineralType'] }

	/** @deprecated */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY] }
	/** @deprecated */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	/** @deprecated */
	@enumerable get mineralAmount() { return this.store[this.mineralType as keyof typeof labStoreFormat] }
	/** @deprecated */
	@enumerable get mineralCapacity() { return C.LAB_MINERAL_CAPACITY }

	/**
	 * Produce mineral compounds using reagents from two other labs. The same input labs can be used
	 * by many output labs.
	 * @param lab1 The first source lab.
	 * @param lab2 The second source lab.
	 */
	runReaction(lab1: StructureLab, lab2: StructureLab) {
		return chainIntentChecks(
			() => checkRunReaction(this, lab1, lab2),
			() => intents.save(this, 'runReaction', lab1.id, lab2.id));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const lab = assign(RoomObject.create(new StructureLab, pos), {
		hits: C.LAB_HITS,
		store: new LabStore,
	});
	lab['#user'] = owner;
	return lab;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_LAB, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.lab : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

// Export `StructureLab` to runtime globals
registerGlobal(StructureLab);
declare module 'xxscreeps/game/runtime' {
	interface Global { StructureLab: typeof StructureLab }
}

export function getReactionProduct(mineral1?: ResourceType, mineral2?: ResourceType) {
	return (C.REACTIONS as Partial<Record<string, Partial<Record<string, ResourceType>>>>)[mineral1!]?.[mineral2!];
}

export function checkRunReaction(lab: StructureLab, left: StructureLab, right: StructureLab) {
	const reaction = getReactionProduct(left.mineralType, right.mineralType);
	if (reaction === undefined) {
		return C.ERR_INVALID_ARGS;
	}
	return chainIntentChecks(
		() => checkMyStructure(lab, StructureLab),
		() => checkTarget(left, StructureLab),
		() => checkTarget(right, StructureLab),
		() => checkRange(lab, left, 2),
		() => checkRange(lab, right, 2),
		() => checkHasCapacity(lab, reaction, C.LAB_REACTION_AMOUNT),
		() => checkHasResource(left, left.mineralType, C.LAB_REACTION_AMOUNT),
		() => checkHasResource(right, right.mineralType, C.LAB_REACTION_AMOUNT),
		() => {
			if (lab.cooldown) {
				return C.ERR_TIRED;
			}
		});
}
