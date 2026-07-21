import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { hooks } from 'xxscreeps/scripts/symbols.js';
import * as C from './constants.js';
import { create as createExtractor } from './extractor.js';
import { Mineral } from './mineral.js';

// Mineral roll weights: H and O are twice as common as Z/K/U/L, and six times as common as X.
const mineralPool: ResourceType[] = [
	C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN,
	C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN, C.RESOURCE_HYDROGEN,
	C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN,
	C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN, C.RESOURCE_OXYGEN,
	C.RESOURCE_ZYNTHIUM, C.RESOURCE_ZYNTHIUM, C.RESOURCE_ZYNTHIUM,
	C.RESOURCE_KEANIUM, C.RESOURCE_KEANIUM, C.RESOURCE_KEANIUM,
	C.RESOURCE_UTRIUM, C.RESOURCE_UTRIUM, C.RESOURCE_UTRIUM,
	C.RESOURCE_LEMERGIUM, C.RESOURCE_LEMERGIUM, C.RESOURCE_LEMERGIUM,
	C.RESOURCE_CATALYST,
];

const iterateGridInRange = makeLocalIterateInRangeTo(0, 49);

function pickMineralDensity(): number {
	const random = Math.random();
	return C.MINERAL_DENSITY_PROBABILITY.findIndex(
		probability => probability !== undefined && random <= probability);
}

hooks.register('roomGenerator', {
	order: 2,
	generate(context) {
		const { options, room } = context;
		const mineralType = options.mineral ?? mineralPool[Math.floor(Math.random() * mineralPool.length)]!;
		if (mineralType === false) {
			return true;
		}
		const tile = context.findRandomTile(4, 42, (xx, yy) =>
			context.isPlaceable(xx, yy) && !Fn.some(iterateGridInRange(xx, yy, 4), ([ nxx, nyy ]) => {
				const tags = context.tagsAt(nxx, nyy);
				return tags.has('source') || tags.has('controller');
			}));
		if (tile === undefined) {
			return false;
		}
		const pos = new RoomPosition(tile[0], tile[1], room.name);
		const density = pickMineralDensity();
		const mineral = createRoomObject(new Mineral(), pos);
		mineral.mineralType = mineralType;
		mineral.density = density;
		mineral.mineralAmount = C.MINERAL_DENSITY[density]!;
		context.place(mineral, 'mineral', 'guarded');
		// Keeper and center rooms ship a pre-built, unowned extractor so the mineral is
		// harvestable without the player owning it (vanilla blocks harvest only when the
		// extractor belongs to someone else).
		if (options.controller === false) {
			context.place(createExtractor(pos, null));
		}
		return true;
	},
});

declare module 'xxscreeps/scripts/symbols.js' {
	interface GenerateRoomOptions {
		/** Mineral type, or `false` for no mineral; omit for a random type. */
		mineral?: ResourceType | false;
	}
}
