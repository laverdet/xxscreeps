import { registerEnumerated } from 'xxscreeps/engine/schema/index.js';
import { actionLogFormat } from 'xxscreeps/game/schema.js';
import { openStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';

/** @internal */
export const factoryShape = declare('StructureFactory', struct(ownedStructureShape, {
	...variant('factory'),

	/**
	 * The current amount of hit points of the structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureFactory.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureFactory.store
	 */
	store: openStoreFormat,
	'#actionLog': actionLogFormat,
	'#cooldownTime': 'int32',
	'#level': 'int32',
}));

// Register commodity resource types into `ResourceType` enum and `RESOURCES_ALL`
const resources = [
	// Bars
	C.RESOURCE_UTRIUM_BAR, C.RESOURCE_LEMERGIUM_BAR, C.RESOURCE_ZYNTHIUM_BAR, C.RESOURCE_KEANIUM_BAR,
	C.RESOURCE_GHODIUM_MELT, C.RESOURCE_OXIDANT, C.RESOURCE_REDUCTANT, C.RESOURCE_PURIFIER,

	// Battery
	C.RESOURCE_BATTERY,

	// Deposit resources
	C.RESOURCE_SILICON, C.RESOURCE_METAL, C.RESOURCE_BIOMASS, C.RESOURCE_MIST,

	// Ops
	C.RESOURCE_OPS,

	// Composites
	C.RESOURCE_COMPOSITE, C.RESOURCE_CRYSTAL, C.RESOURCE_LIQUID,

	// Electronics chain
	C.RESOURCE_WIRE, C.RESOURCE_SWITCH, C.RESOURCE_TRANSISTOR, C.RESOURCE_MICROCHIP,
	C.RESOURCE_CIRCUIT, C.RESOURCE_DEVICE,

	// Biology chain
	C.RESOURCE_CELL, C.RESOURCE_PHLEGM, C.RESOURCE_TISSUE, C.RESOURCE_MUSCLE,
	C.RESOURCE_ORGANOID, C.RESOURCE_ORGANISM,

	// Mechanics chain
	C.RESOURCE_ALLOY, C.RESOURCE_TUBE, C.RESOURCE_FIXTURES, C.RESOURCE_FRAME,
	C.RESOURCE_HYDRAULICS, C.RESOURCE_MACHINE,

	// Alchemy chain
	C.RESOURCE_CONDENSATE, C.RESOURCE_CONCENTRATE, C.RESOURCE_EXTRACT, C.RESOURCE_SPIRIT,
	C.RESOURCE_EMANATION, C.RESOURCE_ESSENCE,
];
registerEnumerated('ResourceType', ...resources);
C.RESOURCES_ALL.push(...resources);

// Action log types
registerEnumerated('ActionLog.action', 'produce');
