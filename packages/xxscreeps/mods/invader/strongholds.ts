import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import {
	RESOURCE_BATTERY, RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_GHODIUM_MELT,
	RESOURCE_KEANIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_LIQUID, RESOURCE_OXIDANT,
	RESOURCE_PURIFIER, RESOURCE_REDUCTANT, RESOURCE_UTRIUM_BAR, RESOURCE_ZYNTHIUM_BAR,
} from 'xxscreeps/mods/modern/factory/constants.js';

// Stronghold layout templates and loot tables ported from @screeps/common (lib/strongholds.js).
// Each template's `rewardLevel` matches its bunker number. The core's own template entry is omitted
// — deploy spawns peers around an existing core.

export interface StrongholdStructure {
	type: typeof C.STRUCTURE_RAMPART | typeof C.STRUCTURE_TOWER | typeof C.STRUCTURE_CONTAINER | typeof C.STRUCTURE_ROAD;
	dx: number;
	dy: number;
}

export interface StrongholdTemplate {
	rewardLevel: number;
	structures: StrongholdStructure[];
}

// Structures stacked on each picture cell below. Offsets anchor at `x`, the existing core, which
// spawns only the rampart over it.
const legend: Record<string, readonly StrongholdStructure['type'][]> = {
	x: [ C.STRUCTURE_RAMPART ],
	t: [ C.STRUCTURE_TOWER, C.STRUCTURE_RAMPART ],
	c: [ C.STRUCTURE_CONTAINER, C.STRUCTURE_ROAD, C.STRUCTURE_RAMPART ],
	'.': [ C.STRUCTURE_ROAD, C.STRUCTURE_RAMPART ],
};

function parseTemplate(rewardLevel: number, picture: string): StrongholdTemplate {
	const rows = picture.split('\n').map(row => row.replace(/^\t+/, ''));
	const originRow = rows.findIndex(row => row.includes('x'));
	const originCol = rows[originRow]!.indexOf('x');
	return {
		rewardLevel,
		structures: [ ...function*(): Iterable<StrongholdStructure> {
			for (const [ rowIndex, row ] of rows.entries()) {
				for (const [ colIndex, cell ] of [ ...row ].entries()) {
					for (const type of legend[cell] ?? []) {
						yield { type, dx: colIndex - originCol, dy: rowIndex - originRow };
					}
				}
			}
		}() ],
	};
}

export const templates = {
	bunker1: parseTemplate(1, `
		xc
		.t
	`),
	bunker2: parseTemplate(2, `
		t..
		cxc
		..t
	`),
	bunker3: parseTemplate(3, `
		.t.c
		c.x.
		.t.t
		..c.
	`),
	bunker4: parseTemplate(4, `
		..c..
		.t.t.
		c.x.c
		.t.t.
		..c..
	`),
	bunker5: parseTemplate(5, `
		 .....
		.c.t.c.
		..t.t..
		...x...
		..t.t..
		.c.t.c.
		 .....
	`),
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
