/* eslint-disable camelcase */
export const SOURCE_ENERGY_CAPACITY = 3000;
export const SOURCE_ENERGY_NEUTRAL_CAPACITY = 1500;
export const SOURCE_ENERGY_KEEPER_CAPACITY = 4000;

export const GCL_POW = 2.4;
export const GCL_MULTIPLY = 1000000;
export const GCL_NOVICE = 3;

export const MINERAL_REGEN_TIME = 50000;
export const MINERAL_MIN_AMOUNT = {
	'H': 35000,
	'O': 35000,
	'L': 35000,
	'K': 35000,
	'Z': 35000,
	'U': 35000,
	'X': 35000,
};
export const MINERAL_RANDOM_FACTOR = 2;

export const MINERAL_DENSITY = [ undefined, 15000, 35000, 70000, 100000 ];
export const MINERAL_DENSITY_PROBABILITY = [ undefined, 0.1, 0.5, 0.9, 1.0 ];
export const MINERAL_DENSITY_CHANGE = 0.05;

export const DENSITY_LOW = 1;
export const DENSITY_MODERATE = 2;
export const DENSITY_HIGH = 3;
export const DENSITY_ULTRA = 4;

export const DEPOSIT_EXHAUST_MULTIPLY = 0.001;
export const DEPOSIT_EXHAUST_POW = 1.2;
export const DEPOSIT_DECAY_TIME = 50000;

export const SUBSCRIPTION_TOKEN = 'token';

export const RESOURCE_ENERGY = 'energy';
export const RESOURCE_POWER = 'power';

export const RESOURCE_HYDROGEN = 'H';
export const RESOURCE_OXYGEN = 'O';
export const RESOURCE_UTRIUM = 'U';
export const RESOURCE_LEMERGIUM = 'L';
export const RESOURCE_KEANIUM = 'K';
export const RESOURCE_ZYNTHIUM = 'Z';
export const RESOURCE_CATALYST = 'X';
export const RESOURCE_GHODIUM = 'G';

export const RESOURCE_SILICON = 'silicon';
export const RESOURCE_METAL = 'metal';
export const RESOURCE_BIOMASS = 'biomass';
export const RESOURCE_MIST = 'mist';

export const RESOURCE_HYDROXIDE = 'OH';
export const RESOURCE_ZYNTHIUM_KEANITE = 'ZK';
export const RESOURCE_UTRIUM_LEMERGITE = 'UL';

export const RESOURCE_UTRIUM_HYDRIDE = 'UH';
export const RESOURCE_UTRIUM_OXIDE = 'UO';
export const RESOURCE_KEANIUM_HYDRIDE = 'KH';
export const RESOURCE_KEANIUM_OXIDE = 'KO';
export const RESOURCE_LEMERGIUM_HYDRIDE = 'LH';
export const RESOURCE_LEMERGIUM_OXIDE = 'LO';
export const RESOURCE_ZYNTHIUM_HYDRIDE = 'ZH';
export const RESOURCE_ZYNTHIUM_OXIDE = 'ZO';
export const RESOURCE_GHODIUM_HYDRIDE = 'GH';
export const RESOURCE_GHODIUM_OXIDE = 'GO';

export const RESOURCE_UTRIUM_ACID = 'UH2O';
export const RESOURCE_UTRIUM_ALKALIDE = 'UHO2';
export const RESOURCE_KEANIUM_ACID = 'KH2O';
export const RESOURCE_KEANIUM_ALKALIDE = 'KHO2';
export const RESOURCE_LEMERGIUM_ACID = 'LH2O';
export const RESOURCE_LEMERGIUM_ALKALIDE = 'LHO2';
export const RESOURCE_ZYNTHIUM_ACID = 'ZH2O';
export const RESOURCE_ZYNTHIUM_ALKALIDE = 'ZHO2';
export const RESOURCE_GHODIUM_ACID = 'GH2O';
export const RESOURCE_GHODIUM_ALKALIDE = 'GHO2';

export const RESOURCE_CATALYZED_UTRIUM_ACID = 'XUH2O';
export const RESOURCE_CATALYZED_UTRIUM_ALKALIDE = 'XUHO2';
export const RESOURCE_CATALYZED_KEANIUM_ACID = 'XKH2O';
export const RESOURCE_CATALYZED_KEANIUM_ALKALIDE = 'XKHO2';
export const RESOURCE_CATALYZED_LEMERGIUM_ACID = 'XLH2O';
export const RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE = 'XLHO2';
export const RESOURCE_CATALYZED_ZYNTHIUM_ACID = 'XZH2O';
export const RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE = 'XZHO2';
export const RESOURCE_CATALYZED_GHODIUM_ACID = 'XGH2O';
export const RESOURCE_CATALYZED_GHODIUM_ALKALIDE = 'XGHO2';

export const RESOURCE_OPS = 'ops';

export const RESOURCE_UTRIUM_BAR = 'utrium_bar';
export const RESOURCE_LEMERGIUM_BAR = 'lemergium_bar';
export const RESOURCE_ZYNTHIUM_BAR = 'zynthium_bar';
export const RESOURCE_KEANIUM_BAR = 'keanium_bar';
export const RESOURCE_GHODIUM_MELT = 'ghodium_melt';
export const RESOURCE_OXIDANT = 'oxidant';
export const RESOURCE_REDUCTANT = 'reductant';
export const RESOURCE_PURIFIER = 'purifier';
export const RESOURCE_BATTERY = 'battery';

export const RESOURCE_COMPOSITE = 'composite';
export const RESOURCE_CRYSTAL = 'crystal';
export const RESOURCE_LIQUID = 'liquid';

export const RESOURCE_WIRE = 'wire';
export const RESOURCE_SWITCH = 'switch';
export const RESOURCE_TRANSISTOR = 'transistor';
export const RESOURCE_MICROCHIP = 'microchip';
export const RESOURCE_CIRCUIT = 'circuit';
export const RESOURCE_DEVICE = 'device';

export const RESOURCE_CELL = 'cell';
export const RESOURCE_PHLEGM = 'phlegm';
export const RESOURCE_TISSUE = 'tissue';
export const RESOURCE_MUSCLE = 'muscle';
export const RESOURCE_ORGANOID = 'organoid';
export const RESOURCE_ORGANISM = 'organism';

export const RESOURCE_ALLOY = 'alloy';
export const RESOURCE_TUBE = 'tube';
export const RESOURCE_FIXTURES = 'fixtures';
export const RESOURCE_FRAME = 'frame';
export const RESOURCE_HYDRAULICS = 'hydraulics';
export const RESOURCE_MACHINE = 'machine';

export const RESOURCE_CONDENSATE = 'condensate';
export const RESOURCE_CONCENTRATE = 'concentrate';
export const RESOURCE_EXTRACT = 'extract';
export const RESOURCE_SPIRIT = 'spirit';
export const RESOURCE_EMANATION = 'emanation';
export const RESOURCE_ESSENCE = 'essence';

export const REACTIONS = {
	H: { O: 'OH', L: 'LH', K: 'KH', U: 'UH', Z: 'ZH', G: 'GH' },
	O: { H: 'OH', L: 'LO', K: 'KO', U: 'UO', Z: 'ZO', G: 'GO' },
	Z: { K: 'ZK', H: 'ZH', O: 'ZO' },
	L: { U: 'UL', H: 'LH', O: 'LO' },
	K: { Z: 'ZK', H: 'KH', O: 'KO' },
	G: { H: 'GH', O: 'GO' },
	U: { L: 'UL', H: 'UH', O: 'UO' },
	OH: {
		UH: 'UH2O',
		UO: 'UHO2',
		ZH: 'ZH2O',
		ZO: 'ZHO2',
		KH: 'KH2O',
		KO: 'KHO2',
		LH: 'LH2O',
		LO: 'LHO2',
		GH: 'GH2O',
		GO: 'GHO2',
	},
	X: {
		UH2O: 'XUH2O',
		UHO2: 'XUHO2',
		LH2O: 'XLH2O',
		LHO2: 'XLHO2',
		KH2O: 'XKH2O',
		KHO2: 'XKHO2',
		ZH2O: 'XZH2O',
		ZHO2: 'XZHO2',
		GH2O: 'XGH2O',
		GHO2: 'XGHO2',
	},
	ZK: { UL: 'G' },
	UL: { ZK: 'G' },
	LH: { OH: 'LH2O' },
	ZH: { OH: 'ZH2O' },
	GH: { OH: 'GH2O' },
	KH: { OH: 'KH2O' },
	UH: { OH: 'UH2O' },
	LO: { OH: 'LHO2' },
	ZO: { OH: 'ZHO2' },
	KO: { OH: 'KHO2' },
	UO: { OH: 'UHO2' },
	GO: { OH: 'GHO2' },
	LH2O: { X: 'XLH2O' },
	KH2O: { X: 'XKH2O' },
	ZH2O: { X: 'XZH2O' },
	UH2O: { X: 'XUH2O' },
	GH2O: { X: 'XGH2O' },
	LHO2: { X: 'XLHO2' },
	UHO2: { X: 'XUHO2' },
	KHO2: { X: 'XKHO2' },
	ZHO2: { X: 'XZHO2' },
	GHO2: { X: 'XGHO2' },
};

export const BOOSTS = {
	work: {
		UO: { harvest: 3 },
		UHO2: { harvest: 5 },
		XUHO2: { harvest: 7 },
		LH: { build: 1.5, repair: 1.5 },
		LH2O: { build: 1.8, repair: 1.8 },
		XLH2O: { build: 2, repair: 2 },
		ZH: { dismantle: 2 },
		ZH2O: { dismantle: 3 },
		XZH2O: { dismantle: 4 },
		GH: { upgradeController: 1.5 },
		GH2O: { upgradeController: 1.8 },
		XGH2O: { upgradeController: 2 },
	},
	attack: {
		UH: { attack: 2 },
		UH2O: { attack: 3 },
		XUH2O: { attack: 4 },
	},
	ranged_attack: {
		KO: { rangedAttack: 2, rangedMassAttack: 2 },
		KHO2: { rangedAttack: 3, rangedMassAttack: 3 },
		XKHO2: { rangedAttack: 4, rangedMassAttack: 4 },
	},
	heal: {
		LO: { heal: 2, rangedHeal: 2 },
		LHO2: { heal: 3, rangedHeal: 3 },
		XLHO2: { heal: 4, rangedHeal: 4 },
	},
	carry: {
		KH: { capacity: 2 },
		KH2O: { capacity: 3 },
		XKH2O: { capacity: 4 },
	},
	move: {
		ZO: { fatigue: 2 },
		ZHO2: { fatigue: 3 },
		XZHO2: { fatigue: 4 },
	},
	tough: {
		GO: { damage: .7 },
		GHO2: { damage: .5 },
		XGHO2: { damage: .3 },
	},
};

export const REACTION_TIME = {
	OH: 20,
	ZK: 5,
	UL: 5,
	G: 5,
	UH: 10,
	UH2O: 5,
	XUH2O: 60,
	UO: 10,
	UHO2: 5,
	XUHO2: 60,
	KH: 10,
	KH2O: 5,
	XKH2O: 60,
	KO: 10,
	KHO2: 5,
	XKHO2: 60,
	LH: 15,
	LH2O: 10,
	XLH2O: 65,
	LO: 10,
	LHO2: 5,
	XLHO2: 60,
	ZH: 20,
	ZH2O: 40,
	XZH2O: 160,
	ZO: 10,
	ZHO2: 5,
	XZHO2: 60,
	GH: 10,
	GH2O: 15,
	XGH2O: 80,
	GO: 10,
	GHO2: 30,
	XGHO2: 150,
};

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
