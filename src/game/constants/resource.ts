export const GCL_POW = 2.4;
export const GCL_MULTIPLY = 1000000;
export const GCL_NOVICE = 3;

export const SUBSCRIPTION_TOKEN = 'token' as const;

export const RESOURCE_SILICON = 'silicon' as const;
export const RESOURCE_METAL = 'metal' as const;
export const RESOURCE_BIOMASS = 'biomass' as const;
export const RESOURCE_MIST = 'mist' as const;

export const RESOURCE_OPS = 'ops' as const;

export const RESOURCE_UTRIUM_BAR = 'utrium_bar' as const;
export const RESOURCE_LEMERGIUM_BAR = 'lemergium_bar' as const;
export const RESOURCE_ZYNTHIUM_BAR = 'zynthium_bar' as const;
export const RESOURCE_KEANIUM_BAR = 'keanium_bar' as const;
export const RESOURCE_GHODIUM_MELT = 'ghodium_melt' as const;
export const RESOURCE_OXIDANT = 'oxidant' as const;
export const RESOURCE_REDUCTANT = 'reductant' as const;
export const RESOURCE_PURIFIER = 'purifier' as const;
export const RESOURCE_BATTERY = 'battery' as const;

export const RESOURCE_COMPOSITE = 'composite' as const;
export const RESOURCE_CRYSTAL = 'crystal' as const;
export const RESOURCE_LIQUID = 'liquid' as const;

export const RESOURCE_WIRE = 'wire' as const;
export const RESOURCE_SWITCH = 'switch' as const;
export const RESOURCE_TRANSISTOR = 'transistor' as const;
export const RESOURCE_MICROCHIP = 'microchip' as const;
export const RESOURCE_CIRCUIT = 'circuit' as const;
export const RESOURCE_DEVICE = 'device' as const;

export const RESOURCE_CELL = 'cell' as const;
export const RESOURCE_PHLEGM = 'phlegm' as const;
export const RESOURCE_TISSUE = 'tissue' as const;
export const RESOURCE_MUSCLE = 'muscle' as const;
export const RESOURCE_ORGANOID = 'organoid' as const;
export const RESOURCE_ORGANISM = 'organism' as const;

export const RESOURCE_ALLOY = 'alloy' as const;
export const RESOURCE_TUBE = 'tube' as const;
export const RESOURCE_FIXTURES = 'fixtures' as const;
export const RESOURCE_FRAME = 'frame' as const;
export const RESOURCE_HYDRAULICS = 'hydraulics' as const;
export const RESOURCE_MACHINE = 'machine' as const;

export const RESOURCE_CONDENSATE = 'condensate' as const;
export const RESOURCE_CONCENTRATE = 'concentrate' as const;
export const RESOURCE_EXTRACT = 'extract' as const;
export const RESOURCE_SPIRIT = 'spirit' as const;
export const RESOURCE_EMANATION = 'emanation' as const;
export const RESOURCE_ESSENCE = 'essence' as const;

export const INTERSHARD_RESOURCES = [];
export const COMMODITIES = {};
/*
export const RESOURCES_ALL = [
	RESOURCE_ENERGY,
	RESOURCE_POWER,

	RESOURCE_HYDROGEN,
	RESOURCE_OXYGEN,
	RESOURCE_UTRIUM,
	RESOURCE_KEANIUM,
	RESOURCE_LEMERGIUM,
	RESOURCE_ZYNTHIUM,
	RESOURCE_CATALYST,
	RESOURCE_GHODIUM,

	RESOURCE_HYDROXIDE,
	RESOURCE_ZYNTHIUM_KEANITE,
	RESOURCE_UTRIUM_LEMERGITE,

	RESOURCE_UTRIUM_HYDRIDE,
	RESOURCE_UTRIUM_OXIDE,
	RESOURCE_KEANIUM_HYDRIDE,
	RESOURCE_KEANIUM_OXIDE,
	RESOURCE_LEMERGIUM_HYDRIDE,
	RESOURCE_LEMERGIUM_OXIDE,
	RESOURCE_ZYNTHIUM_HYDRIDE,
	RESOURCE_ZYNTHIUM_OXIDE,
	RESOURCE_GHODIUM_HYDRIDE,
	RESOURCE_GHODIUM_OXIDE,

	RESOURCE_UTRIUM_ACID,
	RESOURCE_UTRIUM_ALKALIDE,
	RESOURCE_KEANIUM_ACID,
	RESOURCE_KEANIUM_ALKALIDE,
	RESOURCE_LEMERGIUM_ACID,
	RESOURCE_LEMERGIUM_ALKALIDE,
	RESOURCE_ZYNTHIUM_ACID,
	RESOURCE_ZYNTHIUM_ALKALIDE,
	RESOURCE_GHODIUM_ACID,
	RESOURCE_GHODIUM_ALKALIDE,

	RESOURCE_CATALYZED_UTRIUM_ACID,
	RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
	RESOURCE_CATALYZED_KEANIUM_ACID,
	RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
	RESOURCE_CATALYZED_LEMERGIUM_ACID,
	RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
	RESOURCE_CATALYZED_ZYNTHIUM_ACID,
	RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
	RESOURCE_CATALYZED_GHODIUM_ACID,
	RESOURCE_CATALYZED_GHODIUM_ALKALIDE,

	RESOURCE_OPS,

	RESOURCE_SILICON,
	RESOURCE_METAL,
	RESOURCE_BIOMASS,
	RESOURCE_MIST,

	RESOURCE_UTRIUM_BAR,
	RESOURCE_LEMERGIUM_BAR,
	RESOURCE_ZYNTHIUM_BAR,
	RESOURCE_KEANIUM_BAR,
	RESOURCE_GHODIUM_MELT,
	RESOURCE_OXIDANT,
	RESOURCE_REDUCTANT,
	RESOURCE_PURIFIER,
	RESOURCE_BATTERY,
	RESOURCE_COMPOSITE,
	RESOURCE_CRYSTAL,
	RESOURCE_LIQUID,

	RESOURCE_WIRE,
	RESOURCE_SWITCH,
	RESOURCE_TRANSISTOR,
	RESOURCE_MICROCHIP,
	RESOURCE_CIRCUIT,
	RESOURCE_DEVICE,

	RESOURCE_CELL,
	RESOURCE_PHLEGM,
	RESOURCE_TISSUE,
	RESOURCE_MUSCLE,
	RESOURCE_ORGANOID,
	RESOURCE_ORGANISM,

	RESOURCE_ALLOY,
	RESOURCE_TUBE,
	RESOURCE_FIXTURES,
	RESOURCE_FRAME,
	RESOURCE_HYDRAULICS,
	RESOURCE_MACHINE,

	RESOURCE_CONDENSATE,
	RESOURCE_CONCENTRATE,
	RESOURCE_EXTRACT,
	RESOURCE_SPIRIT,
	RESOURCE_EMANATION,
	RESOURCE_ESSENCE,
];

export const INTERSHARD_RESOURCES = [ SUBSCRIPTION_TOKEN ];

export const COMMODITIES = {
	[RESOURCE_UTRIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_UTRIUM]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_UTRIUM]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_UTRIUM_BAR]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_LEMERGIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_LEMERGIUM]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_LEMERGIUM]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_LEMERGIUM_BAR]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_ZYNTHIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_ZYNTHIUM]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_ZYNTHIUM]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_ZYNTHIUM_BAR]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_KEANIUM_BAR]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_KEANIUM]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_KEANIUM]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_KEANIUM_BAR]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_GHODIUM_MELT]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_GHODIUM]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_GHODIUM]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_GHODIUM_MELT]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_OXIDANT]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_OXYGEN]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_OXYGEN]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_OXIDANT]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_REDUCTANT]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_HYDROGEN]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_HYDROGEN]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_REDUCTANT]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_PURIFIER]: {
		amount: 100,
		cooldown: 20,
		components: {
			[RESOURCE_CATALYST]: 500,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_CATALYST]: {
		amount: 500,
		cooldown: 20,
		components: {
			[RESOURCE_PURIFIER]: 100,
			[RESOURCE_ENERGY]: 200,
		},
	},
	[RESOURCE_BATTERY]: {
		amount: 50,
		cooldown: 10,
		components: {
			[RESOURCE_ENERGY]: 600,
		},
	},
	[RESOURCE_ENERGY]: {
		amount: 500,
		cooldown: 10,
		components: {
			[RESOURCE_BATTERY]: 50,
		},
	},
	[RESOURCE_COMPOSITE]: {
		level: 1,
		amount: 20,
		cooldown: 50,
		components: {
			[RESOURCE_UTRIUM_BAR]: 20,
			[RESOURCE_ZYNTHIUM_BAR]: 20,
			[RESOURCE_ENERGY]: 20,
		},
	},
	[RESOURCE_CRYSTAL]: {
		level: 2,
		amount: 6,
		cooldown: 21,
		components: {
			[RESOURCE_LEMERGIUM_BAR]: 6,
			[RESOURCE_KEANIUM_BAR]: 6,
			[RESOURCE_PURIFIER]: 6,
			[RESOURCE_ENERGY]: 45,
		},
	},
	[RESOURCE_LIQUID]: {
		level: 3,
		amount: 12,
		cooldown: 60,
		components: {
			[RESOURCE_OXIDANT]: 12,
			[RESOURCE_REDUCTANT]: 12,
			[RESOURCE_GHODIUM_MELT]: 12,
			[RESOURCE_ENERGY]: 90,
		},
	},

	[RESOURCE_WIRE]: {
		amount: 20,
		cooldown: 8,
		components: {
			[RESOURCE_UTRIUM_BAR]: 20,
			[RESOURCE_SILICON]: 100,
			[RESOURCE_ENERGY]: 40,
		},
	},
	[RESOURCE_SWITCH]: {
		level: 1,
		amount: 5,
		cooldown: 70,
		components: {
			[RESOURCE_WIRE]: 40,
			[RESOURCE_OXIDANT]: 95,
			[RESOURCE_UTRIUM_BAR]: 35,
			[RESOURCE_ENERGY]: 20,
		},
	},
	[RESOURCE_TRANSISTOR]: {
		level: 2,
		amount: 1,
		cooldown: 59,
		components: {
			[RESOURCE_SWITCH]: 4,
			[RESOURCE_WIRE]: 15,
			[RESOURCE_REDUCTANT]: 85,
			[RESOURCE_ENERGY]: 8,
		},
	},
	[RESOURCE_MICROCHIP]: {
		level: 3,
		amount: 1,
		cooldown: 250,
		components: {
			[RESOURCE_TRANSISTOR]: 2,
			[RESOURCE_COMPOSITE]: 50,
			[RESOURCE_WIRE]: 117,
			[RESOURCE_PURIFIER]: 25,
			[RESOURCE_ENERGY]: 16,
		},
	},
	[RESOURCE_CIRCUIT]: {
		level: 4,
		amount: 1,
		cooldown: 800,
		components: {
			[RESOURCE_MICROCHIP]: 1,
			[RESOURCE_TRANSISTOR]: 5,
			[RESOURCE_SWITCH]: 4,
			[RESOURCE_OXIDANT]: 115,
			[RESOURCE_ENERGY]: 32,
		},
	},
	[RESOURCE_DEVICE]: {
		level: 5,
		amount: 1,
		cooldown: 600,
		components: {
			[RESOURCE_CIRCUIT]: 1,
			[RESOURCE_MICROCHIP]: 3,
			[RESOURCE_CRYSTAL]: 110,
			[RESOURCE_GHODIUM_MELT]: 150,
			[RESOURCE_ENERGY]: 64,
		},
	},

	[RESOURCE_CELL]: {
		amount: 20,
		cooldown: 8,
		components: {
			[RESOURCE_LEMERGIUM_BAR]: 20,
			[RESOURCE_BIOMASS]: 100,
			[RESOURCE_ENERGY]: 40,
		},
	},
	[RESOURCE_PHLEGM]: {
		level: 1,
		amount: 2,
		cooldown: 35,
		components: {
			[RESOURCE_CELL]: 20,
			[RESOURCE_OXIDANT]: 36,
			[RESOURCE_LEMERGIUM_BAR]: 16,
			[RESOURCE_ENERGY]: 8,
		},
	},
	[RESOURCE_TISSUE]: {
		level: 2,
		amount: 2,
		cooldown: 164,
		components: {
			[RESOURCE_PHLEGM]: 10,
			[RESOURCE_CELL]: 10,
			[RESOURCE_REDUCTANT]: 110,
			[RESOURCE_ENERGY]: 16,
		},
	},
	[RESOURCE_MUSCLE]: {
		level: 3,
		amount: 1,
		cooldown: 250,
		components: {
			[RESOURCE_TISSUE]: 3,
			[RESOURCE_PHLEGM]: 3,
			[RESOURCE_ZYNTHIUM_BAR]: 50,
			[RESOURCE_REDUCTANT]: 50,
			[RESOURCE_ENERGY]: 16,
		},
	},
	[RESOURCE_ORGANOID]: {
		level: 4,
		amount: 1,
		cooldown: 800,
		components: {
			[RESOURCE_MUSCLE]: 1,
			[RESOURCE_TISSUE]: 5,
			[RESOURCE_PURIFIER]: 208,
			[RESOURCE_OXIDANT]: 256,
			[RESOURCE_ENERGY]: 32,
		},
	},
	[RESOURCE_ORGANISM]: {
		level: 5,
		amount: 1,
		cooldown: 600,
		components: {
			[RESOURCE_ORGANOID]: 1,
			[RESOURCE_LIQUID]: 150,
			[RESOURCE_TISSUE]: 6,
			[RESOURCE_CELL]: 310,
			[RESOURCE_ENERGY]: 64,
		},
	},

	[RESOURCE_ALLOY]: {
		amount: 20,
		cooldown: 8,
		components: {
			[RESOURCE_ZYNTHIUM_BAR]: 20,
			[RESOURCE_METAL]: 100,
			[RESOURCE_ENERGY]: 40,
		},
	},
	[RESOURCE_TUBE]: {
		level: 1,
		amount: 2,
		cooldown: 45,
		components: {
			[RESOURCE_ALLOY]: 40,
			[RESOURCE_ZYNTHIUM_BAR]: 16,
			[RESOURCE_ENERGY]: 8,
		},
	},
	[RESOURCE_FIXTURES]: {
		level: 2,
		amount: 1,
		cooldown: 115,
		components: {
			[RESOURCE_COMPOSITE]: 20,
			[RESOURCE_ALLOY]: 41,
			[RESOURCE_OXIDANT]: 161,
			[RESOURCE_ENERGY]: 8,
		},
	},
	[RESOURCE_FRAME]: {
		level: 3,
		amount: 1,
		cooldown: 125,
		components: {
			[RESOURCE_FIXTURES]: 2,
			[RESOURCE_TUBE]: 4,
			[RESOURCE_REDUCTANT]: 330,
			[RESOURCE_ZYNTHIUM_BAR]: 31,
			[RESOURCE_ENERGY]: 16,
		},
	},
	[RESOURCE_HYDRAULICS]: {
		level: 4,
		amount: 1,
		cooldown: 800,
		components: {
			[RESOURCE_LIQUID]: 150,
			[RESOURCE_FIXTURES]: 3,
			[RESOURCE_TUBE]: 15,
			[RESOURCE_PURIFIER]: 208,
			[RESOURCE_ENERGY]: 32,
		},
	},
	[RESOURCE_MACHINE]: {
		level: 5,
		amount: 1,
		cooldown: 600,
		components: {
			[RESOURCE_HYDRAULICS]: 1,
			[RESOURCE_FRAME]: 2,
			[RESOURCE_FIXTURES]: 3,
			[RESOURCE_TUBE]: 12,
			[RESOURCE_ENERGY]: 64,
		},
	},

	[RESOURCE_CONDENSATE]: {
		amount: 20,
		cooldown: 8,
		components: {
			[RESOURCE_KEANIUM_BAR]: 20,
			[RESOURCE_MIST]: 100,
			[RESOURCE_ENERGY]: 40,
		},
	},
	[RESOURCE_CONCENTRATE]: {
		level: 1,
		amount: 3,
		cooldown: 41,
		components: {
			[RESOURCE_CONDENSATE]: 30,
			[RESOURCE_KEANIUM_BAR]: 15,
			[RESOURCE_REDUCTANT]: 54,
			[RESOURCE_ENERGY]: 12,
		},
	},
	[RESOURCE_EXTRACT]: {
		level: 2,
		amount: 2,
		cooldown: 128,
		components: {
			[RESOURCE_CONCENTRATE]: 10,
			[RESOURCE_CONDENSATE]: 30,
			[RESOURCE_OXIDANT]: 60,
			[RESOURCE_ENERGY]: 16,
		},
	},
	[RESOURCE_SPIRIT]: {
		level: 3,
		amount: 1,
		cooldown: 200,
		components: {
			[RESOURCE_EXTRACT]: 2,
			[RESOURCE_CONCENTRATE]: 6,
			[RESOURCE_REDUCTANT]: 90,
			[RESOURCE_PURIFIER]: 20,
			[RESOURCE_ENERGY]: 16,
		},
	},
	[RESOURCE_EMANATION]: {
		level: 4,
		amount: 1,
		cooldown: 800,
		components: {
			[RESOURCE_SPIRIT]: 2,
			[RESOURCE_EXTRACT]: 2,
			[RESOURCE_CONCENTRATE]: 3,
			[RESOURCE_KEANIUM_BAR]: 112,
			[RESOURCE_ENERGY]: 32,
		},
	},
	[RESOURCE_ESSENCE]: {
		level: 5,
		amount: 1,
		cooldown: 600,
		components: {
			[RESOURCE_EMANATION]: 1,
			[RESOURCE_SPIRIT]: 3,
			[RESOURCE_CRYSTAL]: 110,
			[RESOURCE_GHODIUM_MELT]: 150,
			[RESOURCE_ENERGY]: 64,
		},
	},
};
*/
