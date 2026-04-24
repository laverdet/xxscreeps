import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { OpenStore, openStoreFormat } from 'xxscreeps/mods/resource/store.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

export const format = declare('StructureFactory', () => compose(shape, StructureFactory));
const shape = struct(ownedStructureFormat, {
	...variant('factory'),
	hits: 'int32',
	store: openStoreFormat,
	'#actionLog': RoomObject.actionLogFormat,
	'#cooldownTime': 'int32',
	'#level': 'int32',
});

export class StructureFactory extends withOverlay(OwnedStructure, shape) {
	@enumerable get cooldown() { return Math.max(0, this['#cooldownTime'] - Game.time); }
	@enumerable get level() { return this['#level'] === 0 ? undefined : this['#level']; }

	/** @deprecated */
	@enumerable get storeCapacity() { return this.store.getCapacity(); }

	override get hitsMax() { return C.FACTORY_HITS; }
	override get structureType() { return C.STRUCTURE_FACTORY; }

	/**
	 * Produces the specified commodity. All the required components should be available in the
	 * factory store.
	 * @param resourceType One of the `RESOURCE_*` constants.
	 */
	produce(resourceType: ResourceType) {
		return chainIntentChecks(
			() => checkProduce(this, resourceType),
			() => intents.save(this, 'produce', resourceType));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const factory = assign(RoomObject.create(new StructureFactory(), pos), {
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
	return C.COMMODITIES[resource] as CommodityRecipe | undefined;
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

// Validation order matches lab's checkRunReaction (ownership, cooldown, isActive, then recipe-dependent checks)
export function checkProduce(factory: StructureFactory, resourceType: ResourceType) {
	return chainIntentChecks(
		() => checkMyStructure(factory, StructureFactory),
		() => {
			if (factory.cooldown > 0) {
				return C.ERR_TIRED;
			}
		},
		() => checkIsActive(factory),
		() => {
			const recipe = getCommodityRecipe(resourceType);
			if (recipe === undefined) {
				return C.ERR_INVALID_ARGS;
			}
			const levelCheck = checkRecipeLevel(factory, recipe);
			if (levelCheck !== undefined) {
				return levelCheck;
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
