import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { OwnedStructure, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { checkHasResource } from '../resource/store.js';
import { LabStore, labStoreFormat } from './store.js';

type BoostEffects = Partial<Record<string, number>>;
type BoostsLookup = Partial<Record<string, Partial<Record<string, BoostEffects>>>>;
type ReactionsLookup = Partial<Record<string, Partial<Record<string, ResourceType>>>>;
type ReactionTimeLookup = Partial<Record<string, number>>;

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

export function getReactionProduct(mineral1: string, mineral2: string): ResourceType | undefined {
	const reactions: ReactionsLookup = C.REACTIONS;
	return reactions[mineral1]?.[mineral2];
}

export function checkBoostCreep(lab: StructureLab, creep: Creep | null | undefined, bodyPartsCount?: number) {
	let mineralType: ResourceType;
	return chainIntentChecks(
		() => checkMyStructure(lab, StructureLab),
		() => checkTarget(creep, Creep),
		() => {
			if (creep!.spawning) {
				return C.ERR_INVALID_TARGET;
			}
		},
		() => checkRange(lab, creep!, 1),
		() => {
			const nextMineralType = lab.mineralType;
			if (lab.store[C.RESOURCE_ENERGY] < C.LAB_BOOST_ENERGY) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
			if (nextMineralType === undefined || lab.store[nextMineralType] < C.LAB_BOOST_MINERAL) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
			mineralType = nextMineralType;
		},
		() => {
			const boosts: BoostsLookup = C.BOOSTS;
			const nonBoostedCount = creep!.body.filter(
				part => !part.boost && boosts[part.type]?.[mineralType]).length;
			if (!nonBoostedCount || (bodyPartsCount && bodyPartsCount > nonBoostedCount)) {
				return C.ERR_NOT_FOUND;
			}
		});
}

export function getReactionVariants(compound: string): [ResourceType, ResourceType][] {
	const result: [ResourceType, ResourceType][] = [];
	for (const [ r1, inner ] of Object.entries(C.REACTIONS)) {
		for (const [ r2, product ] of Object.entries(inner)) {
			if (product === compound) {
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
		() => checkTarget(lab1, StructureLab),
		() => checkTarget(lab2, StructureLab),
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
	const reactionTime: ReactionTimeLookup = C.REACTION_TIME;
	const reagents: Record<string, [string, string]> = {};
	for (const [ r1, inner ] of Object.entries(C.REACTIONS)) {
		for (const [ r2, product ] of Object.entries(inner)) {
			reagents[product] = [ r2, r1 ];
		}
	}
	const calcStep = (m: string): number => {
		const time = reactionTime[m];
		if (!time) return 0;
		return time + calcStep(reagents[m][0]) + calcStep(reagents[m][1]);
	};
	return calcStep(mineral);
}

export function checkRunReaction(lab: StructureLab, left: StructureLab, right: StructureLab) {
	return chainIntentChecks(
		() => checkMyStructure(lab, StructureLab),
		() => {
			if (lab.cooldown) {
				return C.ERR_TIRED;
			}
		},
		() => checkTarget(left, StructureLab),
		() => checkTarget(right, StructureLab),
		() => checkRange(lab, left, 2),
		() => checkRange(lab, right, 2),
		() => {
			if (lab.mineralAmount > lab.mineralCapacity - C.LAB_REACTION_AMOUNT) {
				return C.ERR_FULL;
			}
		},
		() => {
			if (left.mineralAmount < C.LAB_REACTION_AMOUNT || right.mineralAmount < C.LAB_REACTION_AMOUNT) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
		},
		() => {
			const leftMineral = left.mineralType;
			const rightMineral = right.mineralType;
			if (leftMineral === undefined || rightMineral === undefined) {
				return C.ERR_INVALID_ARGS;
			}
			const reaction = getReactionProduct(leftMineral, rightMineral);
			if (reaction === undefined || (lab.mineralType && lab.mineralType !== reaction)) {
				return C.ERR_INVALID_ARGS;
			}
		});
}
