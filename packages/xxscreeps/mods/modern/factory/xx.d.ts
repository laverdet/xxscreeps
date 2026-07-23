declare module 'xxscreeps:mods/game' {
	import type { FactoryRoomSchema } from 'xxscreeps/mods/modern/factory/game.js';

	enum ActionLogSchema {
		produce = 'produce',
	}

	enum ResourceSchema {
		// Deposit resources
		RESOURCE_SILICON = 'silicon',
		RESOURCE_METAL = 'metal',
		RESOURCE_BIOMASS = 'biomass',
		RESOURCE_MIST = 'mist',

		// Ops
		RESOURCE_OPS = 'ops',

		// Bars
		RESOURCE_UTRIUM_BAR = 'utrium_bar',
		RESOURCE_LEMERGIUM_BAR = 'lemergium_bar',
		RESOURCE_ZYNTHIUM_BAR = 'zynthium_bar',
		RESOURCE_KEANIUM_BAR = 'keanium_bar',
		RESOURCE_GHODIUM_MELT = 'ghodium_melt',
		RESOURCE_OXIDANT = 'oxidant',
		RESOURCE_REDUCTANT = 'reductant',
		RESOURCE_PURIFIER = 'purifier',
		RESOURCE_BATTERY = 'battery',

		// Composites
		RESOURCE_COMPOSITE = 'composite',
		RESOURCE_CRYSTAL = 'crystal',
		RESOURCE_LIQUID = 'liquid',

		// Electronics chain
		RESOURCE_WIRE = 'wire',
		RESOURCE_SWITCH = 'switch',
		RESOURCE_TRANSISTOR = 'transistor',
		RESOURCE_MICROCHIP = 'microchip',
		RESOURCE_CIRCUIT = 'circuit',
		RESOURCE_DEVICE = 'device',

		// Biology chain
		RESOURCE_CELL = 'cell',
		RESOURCE_PHLEGM = 'phlegm',
		RESOURCE_TISSUE = 'tissue',
		RESOURCE_MUSCLE = 'muscle',
		RESOURCE_ORGANOID = 'organoid',
		RESOURCE_ORGANISM = 'organism',

		// Mechanics chain
		RESOURCE_ALLOY = 'alloy',
		RESOURCE_TUBE = 'tube',
		RESOURCE_FIXTURES = 'fixtures',
		RESOURCE_FRAME = 'frame',
		RESOURCE_HYDRAULICS = 'hydraulics',
		RESOURCE_MACHINE = 'machine',

		// Alchemy chain
		RESOURCE_CONDENSATE = 'condensate',
		RESOURCE_CONCENTRATE = 'concentrate',
		RESOURCE_EXTRACT = 'extract',
		RESOURCE_SPIRIT = 'spirit',
		RESOURCE_EMANATION = 'emanation',
		RESOURCE_ESSENCE = 'essence',
	}

	interface RoomSchema { factory: [ FactoryRoomSchema ] }
}

declare module 'xxscreeps:mods/processor' {
	import type { FactoryIntents } from 'xxscreeps/mods/modern/factory/processor.js';

	interface Intent { factory: FactoryIntents }
}
