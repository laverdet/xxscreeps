import * as C from 'xxscreeps/game/constants/index.js';

// Populate `COMMODITIES` — the base constant is exported as `{}` from
// `xxscreeps/game/constants/resource.js` and filled here, matching the
// `RESOURCES_ALL` pattern where mods populate shared constants.
Object.assign(C.COMMODITIES, {

	// Bars (any factory level)
	[C.RESOURCE_UTRIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_UTRIUM]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_UTRIUM]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_UTRIUM_BAR]: 100, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_LEMERGIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_LEMERGIUM]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_LEMERGIUM]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_LEMERGIUM_BAR]: 100, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_ZYNTHIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_ZYNTHIUM]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_ZYNTHIUM]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_ZYNTHIUM_BAR]: 100, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_KEANIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_KEANIUM]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_KEANIUM]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_KEANIUM_BAR]: 100, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_GHODIUM_MELT]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_GHODIUM]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_GHODIUM]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_GHODIUM_MELT]: 100, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_OXIDANT]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_OXYGEN]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_OXYGEN]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_OXIDANT]: 100, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_REDUCTANT]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_HYDROGEN]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_HYDROGEN]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_REDUCTANT]: 100, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_PURIFIER]: {
		amount: 100,
		cooldown: 20,
		components: { [C.RESOURCE_CATALYST]: 500, [C.RESOURCE_ENERGY]: 200 },
	},
	[C.RESOURCE_CATALYST]: {
		amount: 500,
		cooldown: 20,
		components: { [C.RESOURCE_PURIFIER]: 100, [C.RESOURCE_ENERGY]: 200 },
	},

	// Battery (any factory level)
	[C.RESOURCE_BATTERY]: {
		amount: 50,
		cooldown: 10,
		components: { [C.RESOURCE_ENERGY]: 600 },
	},
	[C.RESOURCE_ENERGY]: {
		amount: 500,
		cooldown: 10,
		components: { [C.RESOURCE_BATTERY]: 50 },
	},

	// Composites (level 1-3)
	[C.RESOURCE_COMPOSITE]: {
		level: 1, amount: 20, cooldown: 50,
		components: { [C.RESOURCE_UTRIUM_BAR]: 20, [C.RESOURCE_ZYNTHIUM_BAR]: 20, [C.RESOURCE_ENERGY]: 20 },
	},
	[C.RESOURCE_CRYSTAL]: {
		level: 2, amount: 6, cooldown: 21,
		components: { [C.RESOURCE_LEMERGIUM_BAR]: 6, [C.RESOURCE_KEANIUM_BAR]: 6, [C.RESOURCE_PURIFIER]: 6, [C.RESOURCE_ENERGY]: 45 },
	},
	[C.RESOURCE_LIQUID]: {
		level: 3, amount: 12, cooldown: 60,
		components: { [C.RESOURCE_OXIDANT]: 12, [C.RESOURCE_REDUCTANT]: 12, [C.RESOURCE_GHODIUM_MELT]: 12, [C.RESOURCE_ENERGY]: 90 },
	},

	// Electronics chain
	[C.RESOURCE_WIRE]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_UTRIUM_BAR]: 20, [C.RESOURCE_SILICON]: 100, [C.RESOURCE_ENERGY]: 40 } },
	[C.RESOURCE_SWITCH]: { level: 1, amount: 5, cooldown: 70, components: { [C.RESOURCE_WIRE]: 40, [C.RESOURCE_OXIDANT]: 95, [C.RESOURCE_UTRIUM_BAR]: 35, [C.RESOURCE_ENERGY]: 20 } },
	[C.RESOURCE_TRANSISTOR]: { level: 2, amount: 1, cooldown: 59, components: { [C.RESOURCE_SWITCH]: 4, [C.RESOURCE_WIRE]: 15, [C.RESOURCE_REDUCTANT]: 85, [C.RESOURCE_ENERGY]: 8 } },
	[C.RESOURCE_MICROCHIP]: { level: 3, amount: 1, cooldown: 250, components: { [C.RESOURCE_TRANSISTOR]: 2, [C.RESOURCE_COMPOSITE]: 50, [C.RESOURCE_WIRE]: 117, [C.RESOURCE_PURIFIER]: 25, [C.RESOURCE_ENERGY]: 16 } },
	[C.RESOURCE_CIRCUIT]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_MICROCHIP]: 1, [C.RESOURCE_TRANSISTOR]: 5, [C.RESOURCE_SWITCH]: 4, [C.RESOURCE_OXIDANT]: 115, [C.RESOURCE_ENERGY]: 32 } },
	[C.RESOURCE_DEVICE]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_CIRCUIT]: 1, [C.RESOURCE_MICROCHIP]: 3, [C.RESOURCE_CRYSTAL]: 110, [C.RESOURCE_GHODIUM_MELT]: 150, [C.RESOURCE_ENERGY]: 64 } },

	// Biology chain
	[C.RESOURCE_CELL]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_LEMERGIUM_BAR]: 20, [C.RESOURCE_BIOMASS]: 100, [C.RESOURCE_ENERGY]: 40 } },
	[C.RESOURCE_PHLEGM]: { level: 1, amount: 2, cooldown: 35, components: { [C.RESOURCE_CELL]: 20, [C.RESOURCE_OXIDANT]: 36, [C.RESOURCE_LEMERGIUM_BAR]: 16, [C.RESOURCE_ENERGY]: 8 } },
	[C.RESOURCE_TISSUE]: { level: 2, amount: 2, cooldown: 164, components: { [C.RESOURCE_PHLEGM]: 10, [C.RESOURCE_CELL]: 10, [C.RESOURCE_REDUCTANT]: 110, [C.RESOURCE_ENERGY]: 16 } },
	[C.RESOURCE_MUSCLE]: { level: 3, amount: 1, cooldown: 250, components: { [C.RESOURCE_TISSUE]: 3, [C.RESOURCE_PHLEGM]: 3, [C.RESOURCE_ZYNTHIUM_BAR]: 50, [C.RESOURCE_REDUCTANT]: 50, [C.RESOURCE_ENERGY]: 16 } },
	[C.RESOURCE_ORGANOID]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_MUSCLE]: 1, [C.RESOURCE_TISSUE]: 5, [C.RESOURCE_PURIFIER]: 208, [C.RESOURCE_OXIDANT]: 256, [C.RESOURCE_ENERGY]: 32 } },
	[C.RESOURCE_ORGANISM]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_ORGANOID]: 1, [C.RESOURCE_LIQUID]: 150, [C.RESOURCE_TISSUE]: 6, [C.RESOURCE_CELL]: 310, [C.RESOURCE_ENERGY]: 64 } },

	// Mechanics chain
	[C.RESOURCE_ALLOY]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_ZYNTHIUM_BAR]: 20, [C.RESOURCE_METAL]: 100, [C.RESOURCE_ENERGY]: 40 } },
	[C.RESOURCE_TUBE]: { level: 1, amount: 2, cooldown: 45, components: { [C.RESOURCE_ALLOY]: 40, [C.RESOURCE_ZYNTHIUM_BAR]: 16, [C.RESOURCE_ENERGY]: 8 } },
	[C.RESOURCE_FIXTURES]: { level: 2, amount: 1, cooldown: 115, components: { [C.RESOURCE_COMPOSITE]: 20, [C.RESOURCE_ALLOY]: 41, [C.RESOURCE_OXIDANT]: 161, [C.RESOURCE_ENERGY]: 8 } },
	[C.RESOURCE_FRAME]: { level: 3, amount: 1, cooldown: 125, components: { [C.RESOURCE_FIXTURES]: 2, [C.RESOURCE_TUBE]: 4, [C.RESOURCE_REDUCTANT]: 330, [C.RESOURCE_ZYNTHIUM_BAR]: 31, [C.RESOURCE_ENERGY]: 16 } },
	[C.RESOURCE_HYDRAULICS]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_LIQUID]: 150, [C.RESOURCE_FIXTURES]: 3, [C.RESOURCE_TUBE]: 15, [C.RESOURCE_PURIFIER]: 208, [C.RESOURCE_ENERGY]: 32 } },
	[C.RESOURCE_MACHINE]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_HYDRAULICS]: 1, [C.RESOURCE_FRAME]: 2, [C.RESOURCE_FIXTURES]: 3, [C.RESOURCE_TUBE]: 12, [C.RESOURCE_ENERGY]: 64 } },

	// Alchemy chain
	[C.RESOURCE_CONDENSATE]: { amount: 20, cooldown: 8, components: { [C.RESOURCE_KEANIUM_BAR]: 20, [C.RESOURCE_MIST]: 100, [C.RESOURCE_ENERGY]: 40 } },
	[C.RESOURCE_CONCENTRATE]: { level: 1, amount: 3, cooldown: 41, components: { [C.RESOURCE_CONDENSATE]: 30, [C.RESOURCE_KEANIUM_BAR]: 15, [C.RESOURCE_REDUCTANT]: 54, [C.RESOURCE_ENERGY]: 12 } },
	[C.RESOURCE_EXTRACT]: { level: 2, amount: 2, cooldown: 128, components: { [C.RESOURCE_CONCENTRATE]: 10, [C.RESOURCE_CONDENSATE]: 30, [C.RESOURCE_OXIDANT]: 60, [C.RESOURCE_ENERGY]: 16 } },
	[C.RESOURCE_SPIRIT]: { level: 3, amount: 1, cooldown: 200, components: { [C.RESOURCE_EXTRACT]: 2, [C.RESOURCE_CONCENTRATE]: 6, [C.RESOURCE_REDUCTANT]: 90, [C.RESOURCE_PURIFIER]: 20, [C.RESOURCE_ENERGY]: 16 } },
	[C.RESOURCE_EMANATION]: { level: 4, amount: 1, cooldown: 800, components: { [C.RESOURCE_SPIRIT]: 2, [C.RESOURCE_EXTRACT]: 2, [C.RESOURCE_CONCENTRATE]: 3, [C.RESOURCE_KEANIUM_BAR]: 112, [C.RESOURCE_ENERGY]: 32 } },
	[C.RESOURCE_ESSENCE]: { level: 5, amount: 1, cooldown: 600, components: { [C.RESOURCE_EMANATION]: 1, [C.RESOURCE_SPIRIT]: 3, [C.RESOURCE_CRYSTAL]: 110, [C.RESOURCE_GHODIUM_MELT]: 150, [C.RESOURCE_ENERGY]: 64 } },
});
