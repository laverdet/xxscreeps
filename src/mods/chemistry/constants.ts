export const STRUCTURE_LAB = 'lab' as const;

export const LAB_HITS = 500;
export const LAB_MINERAL_CAPACITY = 3000;
export const LAB_ENERGY_CAPACITY = 2000;
export const LAB_BOOST_ENERGY = 20;
export const LAB_BOOST_MINERAL = 30;
export const LAB_COOLDOWN = 10;
export const LAB_REACTION_AMOUNT = 5;
export const LAB_UNBOOST_ENERGY = 0;
export const LAB_UNBOOST_MINERAL = 15;

export const RESOURCE_HYDROXIDE = 'OH' as const;
export const RESOURCE_ZYNTHIUM_KEANITE = 'ZK' as const;
export const RESOURCE_UTRIUM_LEMERGITE = 'UL' as const;

export const RESOURCE_UTRIUM_HYDRIDE = 'UH' as const;
export const RESOURCE_UTRIUM_OXIDE = 'UO' as const;
export const RESOURCE_KEANIUM_HYDRIDE = 'KH' as const;
export const RESOURCE_KEANIUM_OXIDE = 'KO' as const;
export const RESOURCE_LEMERGIUM_HYDRIDE = 'LH' as const;
export const RESOURCE_LEMERGIUM_OXIDE = 'LO' as const;
export const RESOURCE_ZYNTHIUM_HYDRIDE = 'ZH' as const;
export const RESOURCE_ZYNTHIUM_OXIDE = 'ZO' as const;
export const RESOURCE_GHODIUM_HYDRIDE = 'GH' as const;
export const RESOURCE_GHODIUM_OXIDE = 'GO' as const;

export const RESOURCE_UTRIUM_ACID = 'UH2O' as const;
export const RESOURCE_UTRIUM_ALKALIDE = 'UHO2' as const;
export const RESOURCE_KEANIUM_ACID = 'KH2O' as const;
export const RESOURCE_KEANIUM_ALKALIDE = 'KHO2' as const;
export const RESOURCE_LEMERGIUM_ACID = 'LH2O' as const;
export const RESOURCE_LEMERGIUM_ALKALIDE = 'LHO2' as const;
export const RESOURCE_ZYNTHIUM_ACID = 'ZH2O' as const;
export const RESOURCE_ZYNTHIUM_ALKALIDE = 'ZHO2' as const;
export const RESOURCE_GHODIUM_ACID = 'GH2O' as const;
export const RESOURCE_GHODIUM_ALKALIDE = 'GHO2' as const;

export const RESOURCE_CATALYZED_UTRIUM_ACID = 'XUH2O' as const;
export const RESOURCE_CATALYZED_UTRIUM_ALKALIDE = 'XUHO2' as const;
export const RESOURCE_CATALYZED_KEANIUM_ACID = 'XKH2O' as const;
export const RESOURCE_CATALYZED_KEANIUM_ALKALIDE = 'XKHO2' as const;
export const RESOURCE_CATALYZED_LEMERGIUM_ACID = 'XLH2O' as const;
export const RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE = 'XLHO2' as const;
export const RESOURCE_CATALYZED_ZYNTHIUM_ACID = 'XZH2O' as const;
export const RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE = 'XZHO2' as const;
export const RESOURCE_CATALYZED_GHODIUM_ACID = 'XGH2O' as const;
export const RESOURCE_CATALYZED_GHODIUM_ALKALIDE = 'XGHO2' as const;

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
} as const;

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
	// eslint-disable-next-line camelcase
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
		GO: { damage: 0.7 },
		GHO2: { damage: 0.5 },
		XGHO2: { damage: 0.3 },
	},
} as const;

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
} as const;
