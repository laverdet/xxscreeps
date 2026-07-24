import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { iterateArea, iterateInRangeTo } from 'xxscreeps/game/position.js';
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

function pickMineralDensity(): number {
	const random = Math.random();
	return C.MINERAL_DENSITY_PROBABILITY.findIndex(
		probability => probability !== undefined && random <= probability);
}

// Rooms whose sources were spread (three or more) spread their mineral the same way, like a
// fourth source; the keeper lairs guarding them then land apart as well.
const kSpreadSourceThreshold = 3;

hooks.register('roomGenerator', {
	order: 2,
	generate(context) {
		const { options } = context;
		const mineralType = options.mineral ?? mineralPool[Math.floor(Math.random() * mineralPool.length)]!;
		if (mineralType === false) {
			return true;
		}
		const accept = (candidate: RoomPosition) =>
			context.isPlaceable(candidate) && !Fn.some(iterateInRangeTo(candidate, 4), near => {
				const tags = context.tagsAt(near);
				return tags.has('source') || tags.has('controller');
			});
		const sources = [ ...Fn.filter(
			iterateArea(context.room.name, 0, 0, 49, 49),
			candidate => context.tagsAt(candidate).has('source')) ];
		const position = sources.length >= kSpreadSourceThreshold
			? context.findSpreadPosition(4, 42, accept, sources)
			: context.findRandomPosition(4, 42, accept);
		if (position === undefined) {
			return false;
		}
		const density = pickMineralDensity();
		const mineral = createRoomObject(new Mineral(), position);
		mineral.mineralType = mineralType;
		mineral.density = density;
		mineral.mineralAmount = C.MINERAL_DENSITY[density]!;
		context.place(mineral, 'mineral', 'guarded');
		// Keeper and center rooms ship a pre-built, unowned extractor so the mineral is
		// harvestable without the player owning it (vanilla blocks harvest only when the
		// extractor belongs to someone else).
		if (options.controller === false) {
			context.place(createExtractor(position, null));
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
