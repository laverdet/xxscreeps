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

// Populated by factory mod via Object.assign
export const COMMODITIES: Partial<Record<string, {
	level?: number;
	amount: number;
	cooldown: number;
	components: Record<string, number>;
}>> = {};
