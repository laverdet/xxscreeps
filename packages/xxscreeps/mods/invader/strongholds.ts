import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import {
	RESOURCE_BATTERY, RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_GHODIUM_MELT,
	RESOURCE_KEANIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_LIQUID, RESOURCE_OXIDANT,
	RESOURCE_PURIFIER, RESOURCE_REDUCTANT, RESOURCE_UTRIUM_BAR, RESOURCE_ZYNTHIUM_BAR,
} from 'xxscreeps/mods/modern/factory/constants.js';

// Stronghold layout templates and loot tables ported from @screeps/common (lib/strongholds.js),
// which is ISC-licensed. Each template's `rewardLevel` matches its bunker number. The core's own
// template entry is omitted — deploy spawns peers around an existing core.

export interface StrongholdStructure {
	type: typeof C.STRUCTURE_RAMPART | typeof C.STRUCTURE_TOWER | typeof C.STRUCTURE_CONTAINER | typeof C.STRUCTURE_ROAD;
	dx: number;
	dy: number;
}

export interface StrongholdTemplate {
	rewardLevel: number;
	structures: StrongholdStructure[];
}

export const templates = {
	bunker1: {
		rewardLevel: 1,
		structures: [
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_TOWER, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_CONTAINER, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 0 },
		],
	},
	bunker2: {
		rewardLevel: 2,
		structures: [
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 0 },
			{ type: C.STRUCTURE_TOWER, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_TOWER, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_CONTAINER, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_CONTAINER, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 0 },
		],
	},
	bunker3: {
		rewardLevel: 3,
		structures: [
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 0 },
			{ type: C.STRUCTURE_TOWER, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_TOWER, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_TOWER, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 2 },
			{ type: C.STRUCTURE_CONTAINER, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_CONTAINER, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_CONTAINER, dx: 0, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 2 },
		],
	},
	bunker4: {
		rewardLevel: 4,
		structures: [
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 0 },
			{ type: C.STRUCTURE_TOWER, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_TOWER, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_TOWER, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_TOWER, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: 2 },
			{ type: C.STRUCTURE_CONTAINER, dx: 2, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: 0 },
			{ type: C.STRUCTURE_CONTAINER, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_CONTAINER, dx: 0, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 2 },
			{ type: C.STRUCTURE_CONTAINER, dx: 0, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: -2 },
		],
	},
	bunker5: {
		rewardLevel: 5,
		structures: [
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 0 },
			{ type: C.STRUCTURE_TOWER, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 1 },
			{ type: C.STRUCTURE_TOWER, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: -1 },
			{ type: C.STRUCTURE_TOWER, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 1 },
			{ type: C.STRUCTURE_TOWER, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: -1 },
			{ type: C.STRUCTURE_TOWER, dx: 0, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: -2 },
			{ type: C.STRUCTURE_TOWER, dx: 0, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: -3 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: -3 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: -3 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: -3 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: -3 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: -3 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: -3 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: -3 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: -3 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: -3 },
			{ type: C.STRUCTURE_ROAD, dx: -3, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: -3, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: 3, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: 3, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: -3, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -3, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: 3, dy: -1 },
			{ type: C.STRUCTURE_RAMPART, dx: 3, dy: -1 },
			{ type: C.STRUCTURE_ROAD, dx: -3, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -3, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: 3, dy: 0 },
			{ type: C.STRUCTURE_RAMPART, dx: 3, dy: 0 },
			{ type: C.STRUCTURE_ROAD, dx: -3, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -3, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: 3, dy: 1 },
			{ type: C.STRUCTURE_RAMPART, dx: 3, dy: 1 },
			{ type: C.STRUCTURE_ROAD, dx: -3, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: -3, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 3, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 3, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 3 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 3 },
			{ type: C.STRUCTURE_ROAD, dx: -1, dy: 3 },
			{ type: C.STRUCTURE_RAMPART, dx: -1, dy: 3 },
			{ type: C.STRUCTURE_ROAD, dx: 0, dy: 3 },
			{ type: C.STRUCTURE_RAMPART, dx: 0, dy: 3 },
			{ type: C.STRUCTURE_ROAD, dx: 1, dy: 3 },
			{ type: C.STRUCTURE_RAMPART, dx: 1, dy: 3 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: 3 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: 3 },
			{ type: C.STRUCTURE_CONTAINER, dx: 2, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: 2 },
			{ type: C.STRUCTURE_CONTAINER, dx: -2, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: -2 },
			{ type: C.STRUCTURE_CONTAINER, dx: 2, dy: -2 },
			{ type: C.STRUCTURE_ROAD, dx: 2, dy: -2 },
			{ type: C.STRUCTURE_RAMPART, dx: 2, dy: -2 },
			{ type: C.STRUCTURE_CONTAINER, dx: -2, dy: 2 },
			{ type: C.STRUCTURE_ROAD, dx: -2, dy: 2 },
			{ type: C.STRUCTURE_RAMPART, dx: -2, dy: 2 },
		],
	},
} satisfies Record<string, StrongholdTemplate>;

// Weighted resource table for the loot in a stronghold's containers, keyed by reward level into
// `containerAmounts`.
export const containerRewards: Record<string, number> = {
	[RESOURCE_UTRIUM_BAR]: 5,
	[RESOURCE_LEMERGIUM_BAR]: 5,
	[RESOURCE_ZYNTHIUM_BAR]: 5,
	[RESOURCE_KEANIUM_BAR]: 5,
	[RESOURCE_OXIDANT]: 5,
	[RESOURCE_REDUCTANT]: 5,
	[RESOURCE_PURIFIER]: 5,
	[RESOURCE_GHODIUM_MELT]: 20,
	[RESOURCE_BATTERY]: 10,
	[RESOURCE_COMPOSITE]: 10,
	[RESOURCE_CRYSTAL]: 15,
	[RESOURCE_LIQUID]: 30,
};

export const containerAmounts = [ 0, 500, 4000, 10000, 50000, 360000 ];

/**
 * Roll `itemsLimit` resources at random from a weighted table and distribute `targetDensity` units
 * of weight across them. The chosen resources sum (in weighted density) to roughly the target.
 */
export function *calcReward(
	weights: Record<string, number>,
	targetDensity: number,
	itemsLimit: number,
): Generator<[ ResourceType, number ]> {
	const picks = Fn.pipe(
		Object.entries(weights),
		$$ => Fn.map($$, entry => ({ entry, order: Math.random() })),
		$$ => [ ...$$ ],
	);
	picks.sort(mappedNumericComparator(pick => pick.order));
	picks.length = Math.min(picks.length, itemsLimit);
	let currentDensity = 0;
	for (const [ ii, { entry: [ resource, density ] } ] of picks.entries()) {
		const remaining = targetDensity - currentDensity;
		// Divergence from Screeps, whose final item divides by a positional density index (a bug)
		// rather than the chosen resource's own density.
		const amount = ii === picks.length - 1
			? Math.max(0, Math.round(remaining / density))
			: Math.max(0, Math.round(Math.random() * remaining / density));
		currentDensity += amount * density;
		if (amount > 0) {
			yield [ resource as ResourceType, amount ];
		}
	}
}
