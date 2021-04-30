export const FIND_MINERALS = 116 as const;
export const LOOK_MINERALS = 'mineral' as const;

export const HARVEST_MINERAL_POWER = 1;

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

export const RESOURCE_HYDROGEN = 'H' as const;
export const RESOURCE_OXYGEN = 'O' as const;
export const RESOURCE_UTRIUM = 'U' as const;
export const RESOURCE_LEMERGIUM = 'L' as const;
export const RESOURCE_KEANIUM = 'K' as const;
export const RESOURCE_ZYNTHIUM = 'Z' as const;
export const RESOURCE_CATALYST = 'X' as const;
export const RESOURCE_GHODIUM = 'G' as const;

export const STRUCTURE_EXTRACTOR = 'extractor' as const;

export const EXTRACTOR_HITS = 500;
export const EXTRACTOR_COOLDOWN = 5;
