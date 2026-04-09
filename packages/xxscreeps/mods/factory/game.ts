import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as Factory from './factory.js';

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const resourceSchema = registerEnumerated('ResourceType', ...resources);
C.RESOURCES_ALL.push(...resources);

declare module 'xxscreeps/mods/resource/index.js' {
	interface Schema { commodity: typeof resourceSchema }
}

// Register `RoomObject` schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const factorySchema = registerVariant('Room.objects', Factory.format);
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { factory: [ typeof factorySchema ] }
}

// Action log types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'produce');
declare module 'xxscreeps/game/object.js' {
	interface Schema { factory: typeof actionSchema }
}
