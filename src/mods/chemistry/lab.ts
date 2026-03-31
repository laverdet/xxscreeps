import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { checkHasCapacity, checkHasResource } from '../resource/store.js';
import { LabStore, labStoreFormat } from './store.js';

export const format = declare('Lab', () => compose(shape, StructureLab));
const shape = struct(ownedStructureFormat, {
	...variant('lab'),
	hits: 'int32',
	store: labStoreFormat,
	'#actionLog': RoomObject.actionLogFormat,
	'#cooldownTime': 'int32',
});

export class StructureLab extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.LAB_HITS; }
	override get structureType() { return C.STRUCTURE_LAB; }
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time); }
	@enumerable get mineralType() { return this.store['#mineralType']; }

	/** @deprecated */
	@enumerable get energy() { return this.store[C.RESOURCE_ENERGY]; }
	/** @deprecated */
	@enumerable get energyCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY); }
	/** @deprecated */
	@enumerable get mineralAmount() { const type = this.mineralType; return type ? this.store[type] : 0; }
	/** @deprecated */
	@enumerable get mineralCapacity() { return C.LAB_MINERAL_CAPACITY; }

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

	boostCreep(creep: Creep, bodyPartsCount?: number) {
		return chainIntentChecks(
			() => checkBoostCreep(this, creep, bodyPartsCount),
			() => intents.save(this, 'boostCreep', creep.id, bodyPartsCount ?? 0));
	}

	reverseReaction(lab1: StructureLab, lab2: StructureLab) {
		return chainIntentChecks(
			() => checkReverseReaction(this, lab1, lab2),
			() => intents.save(this, 'reverseReaction', lab1.id, lab2.id));
	}

	unboostCreep(creep: Creep) {
		return chainIntentChecks(
			() => checkUnboostCreep(this, creep),
			() => intents.save(this, 'unboostCreep', creep.id));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const lab = assign(RoomObject.create(new StructureLab(), pos), {
		hits: C.LAB_HITS,
		store: new LabStore(),
	});
	lab['#user'] = owner;
	return lab;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_LAB, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.lab : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

// Export `StructureLab` to runtime globals
registerGlobal(StructureLab);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureLab: typeof StructureLab }
}

export function getReactionProduct(mineral1?: ResourceType, mineral2?: ResourceType) {
	return (C.REACTIONS as Partial<Record<string, Partial<Record<string, ResourceType>>>>)[mineral1!]?.[mineral2!];
}

export function checkBoostCreep(lab: StructureLab, creep: Creep | null | undefined, bodyPartsCount?: number) {
	const mineralType = lab.mineralType;
	return chainIntentChecks(
		() => checkMyStructure(lab, StructureLab),
		() => checkIsActive(lab),
		() => checkTarget(creep, Creep),
		() => {
			if (creep!.spawning) {
				return C.ERR_INVALID_TARGET;
			}
		},
		() => checkRange(lab, creep!, 1),
		() => {
			if (lab.store[C.RESOURCE_ENERGY] < C.LAB_BOOST_ENERGY) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
			if (!mineralType || lab.store[mineralType] < C.LAB_BOOST_MINERAL) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
		},
		() => {
			const boosts = C.BOOSTS as Partial<Record<string, Partial<Record<string, unknown>>>>;
			const nonBoostedCount = creep!.body.filter(
				p => !p.boost && boosts[p.type]?.[mineralType!]).length;
			if (!nonBoostedCount || (bodyPartsCount && bodyPartsCount > nonBoostedCount)) {
				return C.ERR_NOT_FOUND;
			}
		});
}

export function getReactionVariants(compound: ResourceType): [ResourceType, ResourceType][] {
	const result: [ResourceType, ResourceType][] = [];
	const reactions = C.REACTIONS as Record<string, Record<string, string>>;
	for (const r1 in reactions) {
		for (const r2 in reactions[r1]) {
			if (reactions[r1][r2] === compound) {
				result.push([ r1 as ResourceType, r2 as ResourceType ]);
			}
		}
	}
	return result;
}

export function checkReverseReaction(lab: StructureLab, lab1: StructureLab | null | undefined, lab2: StructureLab | null | undefined) {
	return chainIntentChecks(
		() => checkMyStructure(lab, StructureLab),
		() => {
			if (lab.cooldown) {
				return C.ERR_TIRED;
			}
		},
		() => checkIsActive(lab),
		() => checkTarget(lab1, StructureLab),
		() => checkTarget(lab2, StructureLab),
		() => checkIsActive(lab1!),
		() => checkIsActive(lab2!),
		() => checkRange(lab, lab1!, 2),
		() => checkRange(lab, lab2!, 2),
		() => {
			if (lab1!.id === lab2!.id) {
				return C.ERR_INVALID_ARGS;
			}
		},
		() => checkHasResource(lab, lab.mineralType, C.LAB_REACTION_AMOUNT),
		() => {
			const mineralType = lab.mineralType!;
			const variants = getReactionVariants(mineralType);
			const variant = variants.find(v =>
				(!lab1!.mineralType || lab1!.mineralType === v[0]) &&
				(!lab2!.mineralType || lab2!.mineralType === v[1]));
			if (!variant) {
				return C.ERR_INVALID_ARGS;
			}
			// Check destination labs can receive reagents
			const lab1Mineral = lab1!.mineralType;
			const lab2Mineral = lab2!.mineralType;
			if (lab1Mineral && (lab1!.store[lab1Mineral] + C.LAB_REACTION_AMOUNT) > C.LAB_MINERAL_CAPACITY) {
				return C.ERR_FULL;
			}
			if (lab2Mineral && (lab2!.store[lab2Mineral] + C.LAB_REACTION_AMOUNT) > C.LAB_MINERAL_CAPACITY) {
				return C.ERR_FULL;
			}
		});
}

export function checkUnboostCreep(lab: StructureLab, creep: Creep | null | undefined) {
	return chainIntentChecks(
		() => checkTarget(creep, Creep),
		() => checkMyStructure(lab, StructureLab),
		() => checkIsActive(lab),
		() => {
			if (!creep!.my) {
				return C.ERR_NOT_OWNER;
			}
		},
		() => {
			if (lab.cooldown) {
				return C.ERR_TIRED;
			}
		},
		() => {
			if (!creep!.body.some(p => !!p.boost)) {
				return C.ERR_NOT_FOUND;
			}
		},
		() => checkRange(lab, creep!, 1));
}

export function calcTotalReactionsTime(mineral: string): number {
	// Build reagent lookup: compound -> [reagent1, reagent2]
	const reactions = C.REACTIONS as Record<string, Record<string, string>>;
	const reagents: Record<string, [string, string]> = {};
	for (const r1 in reactions) {
		for (const r2 in reactions[r1]) {
			reagents[reactions[r1][r2]] = [ r2, r1 ];
		}
	}
	const calcStep = (m: string): number => {
		const time = (C.REACTION_TIME as Record<string, number>)[m];
		if (!time) return 0;
		return time + calcStep(reagents[m][0]) + calcStep(reagents[m][1]);
	};
	return calcStep(mineral);
}

export function checkRunReaction(lab: StructureLab, left: StructureLab, right: StructureLab) {
	const reaction = getReactionProduct(left.mineralType, right.mineralType);
	if (reaction === undefined) {
		return C.ERR_INVALID_ARGS;
	}
	return chainIntentChecks(
		() => checkMyStructure(lab, StructureLab),
		() => {
			if (lab.cooldown) {
				return C.ERR_TIRED;
			}
		},
		() => checkIsActive(lab),
		() => checkTarget(left, StructureLab),
		() => checkTarget(right, StructureLab),
		() => checkIsActive(left),
		() => checkIsActive(right),
		() => checkRange(lab, left, 2),
		() => checkRange(lab, right, 2),
		() => checkHasCapacity(lab, reaction, C.LAB_REACTION_AMOUNT),
		() => checkHasResource(left, left.mineralType, C.LAB_REACTION_AMOUNT),
		() => checkHasResource(right, right.mineralType, C.LAB_REACTION_AMOUNT));
}
