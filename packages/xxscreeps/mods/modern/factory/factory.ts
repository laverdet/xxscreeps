import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { intents, registerGlobal } from 'xxscreeps/game/index.js';
import { cooldownTime, createRoomObject } from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/classic/construction/index.js';
import { OpenStore } from 'xxscreeps/mods/classic/resource/store.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement } from 'xxscreeps/mods/classic/structure/structure.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { factoryShape } from './schema.js';

/**
 * Produces trade commodities from base minerals and other commodities. Learn more about commodities
 * from [this article](https://docs.screeps.com/resources.html#Commodities).
 * @public
 * @see https://docs.screeps.com/api/#StructureFactory
 */
export class StructureFactory extends withOverlay(OwnedStructure, factoryShape) {
	/**
	 * The amount of game ticks the factory has to wait until the next production is possible.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureFactory.cooldown
	 */
	@enumerable get cooldown() { return cooldownTime(this['#cooldownTime']); }

	/**
	 * The factory's level. Can be set by applying the `PWR_OPERATE_FACTORY` power to a newly built
	 * factory. Once set, the level cannot be changed.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureFactory.level
	 */
	@enumerable get level() { return this['#level'] === 0 ? undefined : this['#level']; }

	/**
	 * An alias for `.store.getCapacity()`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#StructureFactory.storeCapacity
	 */
	@enumerable get storeCapacity() { return this.store.getCapacity(); }

	/**
	 * The total amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureFactory.hitsMax
	 */
	override get hitsMax() { return C.FACTORY_HITS; }

	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureFactory.structureType
	 */
	override get structureType() { return C.STRUCTURE_FACTORY; }

	/**
	 * Produces the specified commodity. All ingredients should be available in the factory store.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 * @returns One of the following codes: `OK`, `ERR_NOT_OWNER`, `ERR_RCL_NOT_ENOUGH`,
	 * `ERR_NOT_ENOUGH_RESOURCES`, `ERR_INVALID_ARGS`, `ERR_INVALID_TARGET`, `ERR_TIRED`, `ERR_BUSY`,
	 * `ERR_FULL`
	 * @public
	 * @see https://docs.screeps.com/api/#StructureFactory.produce
	 */
	produce(resourceType: ResourceType) {
		return chainIntentChecks(
			() => checkProduce(this, resourceType),
			() => intents.save(this, 'produce', resourceType));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const factory = assign(createRoomObject(new StructureFactory(), pos), {
		hits: C.FACTORY_HITS,
		store: OpenStore['#create'](C.FACTORY_CAPACITY),
	});
	factory['#user'] = owner;
	return factory;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_FACTORY, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.factory : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

// Export `StructureFactory` to runtime globals
registerGlobal(StructureFactory);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { StructureFactory: typeof StructureFactory }
}

export type CommodityRecipe = {
	level?: number;
	amount: number;
	cooldown: number;
	components: Record<ResourceType, number>;
};

export function getCommodityRecipe(resource: string): CommodityRecipe | undefined {
	return C.COMMODITIES[resource];
}

/**
 * Resolves the effective factory level for recipe validation. In vanilla Screeps the level
 * comes from either a permanent value (stored by depositing power into the factory) or an
 * active PWR_OPERATE_FACTORY effect, whichever is present.
 *
 * Until an effects substrate exists, this only returns the permanent level. When effects
 * land, extend this to prefer an active PWR_OPERATE_FACTORY effect level over the permanent
 * value, and update `checkRecipeLevel` to apply the bars-block rule.
 */
function getEffectiveLevel(factory: StructureFactory): number {
	return factory['#level'];
}

/**
 * Validates a recipe's level requirement against the factory's effective level.
 *
 * Vanilla has a subtlety not captured here: when a factory has BOTH a permanent level and
 * an active PWR_OPERATE_FACTORY effect whose level differs from the permanent value, all
 * level-0 recipes (bars, battery, etc.) are also blocked. That rule requires the effects
 * substrate to observe and cannot be implemented until power creeps exist — add it here.
 */
function checkRecipeLevel(factory: StructureFactory, recipe: CommodityRecipe) {
	if (recipe.level !== undefined && recipe.level !== getEffectiveLevel(factory)) {
		return C.ERR_INVALID_TARGET;
	}
}

// Validation order: ownership, cooldown, recipe checks, then RCL gate.
export function checkProduce(factory: StructureFactory, resourceType: ResourceType) {
	let recipe: CommodityRecipe | undefined;
	return chainIntentChecks(
		() => checkMyStructure(factory, StructureFactory),
		() => {
			if (factory.cooldown > 0) {
				return C.ERR_TIRED;
			}
		},
		() => {
			recipe = getCommodityRecipe(resourceType);
			if (recipe === undefined) {
				return C.ERR_INVALID_ARGS;
			}
			const levelCheck = checkRecipeLevel(factory, recipe);
			if (levelCheck !== undefined) {
				return levelCheck;
			}
		},
		() => checkIsActive(factory),
		() => {
			if (recipe === undefined) {
				return C.ERR_INVALID_ARGS;
			}
			let componentsTotal = 0;
			for (const [ component, amount ] of Object.entries(recipe.components)) {
				if (factory.store[component as ResourceType] < amount) {
					return C.ERR_NOT_ENOUGH_RESOURCES;
				}
				componentsTotal += amount;
			}
			const netChange = recipe.amount - componentsTotal;
			if (netChange > 0 && factory.store.getFreeCapacity() < netChange) {
				return C.ERR_FULL;
			}
		});
}
