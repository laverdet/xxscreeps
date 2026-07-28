import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import {
	RESOURCE_ALLOY, RESOURCE_BATTERY, RESOURCE_BIOMASS, RESOURCE_CELL, RESOURCE_CIRCUIT,
	RESOURCE_COMPOSITE, RESOURCE_CONCENTRATE, RESOURCE_CONDENSATE, RESOURCE_CRYSTAL, RESOURCE_DEVICE,
	RESOURCE_EMANATION, RESOURCE_ESSENCE, RESOURCE_EXTRACT, RESOURCE_FIXTURES, RESOURCE_FRAME,
	RESOURCE_GHODIUM_MELT, RESOURCE_HYDRAULICS, RESOURCE_KEANIUM_BAR, RESOURCE_LEMERGIUM_BAR,
	RESOURCE_LIQUID, RESOURCE_MACHINE, RESOURCE_METAL, RESOURCE_MICROCHIP, RESOURCE_MIST,
	RESOURCE_MUSCLE, RESOURCE_ORGANISM, RESOURCE_ORGANOID, RESOURCE_OXIDANT, RESOURCE_PHLEGM,
	RESOURCE_PURIFIER, RESOURCE_REDUCTANT, RESOURCE_SILICON, RESOURCE_SPIRIT, RESOURCE_SWITCH,
	RESOURCE_TISSUE, RESOURCE_TRANSISTOR, RESOURCE_TUBE, RESOURCE_UTRIUM_BAR, RESOURCE_WIRE,
	RESOURCE_ZYNTHIUM_BAR,
} from 'xxscreeps/mods/modern/factory/constants.js';
import { shuffle } from 'xxscreeps/utility/random.js';
import * as C from 'xxscreeps:mods/constants';

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

// Weighted resource table for the loot in a stronghold's containers; `containerAmounts` maps a
// template's reward level to the total density distributed across the rolled resources.
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

// The commodity chain each deposit type rewards, in refinement order. A destroyed core's reward
// level decides how far along its deposit's chain the loot reaches; `coreAmounts` maps that level to
// the total density distributed across those links and `coreDensities` weights each link in turn.
export const coreRewards = {
	[RESOURCE_SILICON]: [ RESOURCE_WIRE, RESOURCE_SWITCH, RESOURCE_TRANSISTOR, RESOURCE_MICROCHIP, RESOURCE_CIRCUIT, RESOURCE_DEVICE ],
	[RESOURCE_METAL]: [ RESOURCE_ALLOY, RESOURCE_TUBE, RESOURCE_FIXTURES, RESOURCE_FRAME, RESOURCE_HYDRAULICS, RESOURCE_MACHINE ],
	[RESOURCE_BIOMASS]: [ RESOURCE_CELL, RESOURCE_PHLEGM, RESOURCE_TISSUE, RESOURCE_MUSCLE, RESOURCE_ORGANOID, RESOURCE_ORGANISM ],
	[RESOURCE_MIST]: [ RESOURCE_CONDENSATE, RESOURCE_CONCENTRATE, RESOURCE_EXTRACT, RESOURCE_SPIRIT, RESOURCE_EMANATION, RESOURCE_ESSENCE ],
} satisfies Record<string, ResourceType[]>;

export const coreAmounts = [ 0, 1000, 16000, 60000, 400000, 3000000 ];

export const coreDensities = [ 10, 220, 1400, 5100, 14000, 31500 ];

/**
 * Shuffle the resources on offer, keep `itemsLimit` of them if given, and distribute `targetDensity`
 * across the picks. The chosen resources sum (in weighted density) to roughly the target.
 */
export function *calcReward(resourceDensities: Iterable<readonly [ string, number ]>, targetDensity: number, itemsLimit?: number): Iterable<[ ResourceType, number ]> {
	const offered = [ ...resourceDensities ];
	const picks = [ ...Fn.take(shuffle(offered), itemsLimit ?? offered.length) ];
	let currentDensity = 0;
	for (const [ ii, [ resource, density ] ] of picks.entries()) {
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
