import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { RoomGeneratorContext } from 'xxscreeps/scripts/symbols.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { iterateArea, iterateNeighbors } from 'xxscreeps/game/position.js';
import { isBorder } from 'xxscreeps/game/terrain.js';
import { hooks } from 'xxscreeps/scripts/symbols.js';
import * as C from 'xxscreeps:mods/constants';
import { create as createKeeperLair } from './keeper-lair.js';
import { Source } from './source.js';

// Keeper and center rooms (the controller-less ones) bake their sources' 4000 energy capacity at
// generation: Source's '#roomStatusDidChange' computes the same thing from the room owner, but the
// controller processor that drives that hook never runs for a controller-less room.
hooks.register('roomGenerator', {
	order: 0,
	generate(context) {
		const { options } = context;
		const count = options.sources ?? (Math.random() > 0.5 ? 1 : 2);
		const energyCapacity = options.controller === false
			? C.SOURCE_ENERGY_KEEPER_CAPACITY
			: C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
		for (let ii = 0; ii < count; ++ii) {
			const position = context.findRandomPosition(3, 44, context.isPlaceable);
			if (position === undefined) {
				return false;
			}
			const source = createRoomObject(new Source(), position);
			source.energy = source.energyCapacity = energyCapacity;
			context.place(source, 'source', 'guarded');
		}
		return true;
	},
});

// Searches outward from `origin` through passable terrain for a non-border wall tile 3 to 5 steps
// away to host a keeper lair, placing one on a uniformly random candidate. Returns false when no
// tile qualifies, signalling the caller to regenerate.
function placeKeeperLair(context: RoomGeneratorContext, origin: RoomPosition): boolean {
	const visited = new Map([ [ origin['#id'], 0 ] ]);
	const stack = [ origin ];
	const spots = [ ...function*(): Iterable<RoomPosition> {
		while (stack.length > 0) {
			const current = stack.pop()!;
			const distance = visited.get(current['#id'])! + 1;
			for (const neighbor of iterateNeighbors(current)) {
				const key = neighbor['#id'];
				if (visited.has(key)) {
					continue;
				}
				visited.set(key, distance);
				if (distance >= 3 && distance <= 5 && !isBorder(neighbor.x, neighbor.y) && context.isPlaceable(neighbor)) {
					yield neighbor;
				}
				if (context.terrain.get(neighbor.x, neighbor.y) !== C.TERRAIN_MASK_WALL && distance < 5) {
					stack.push(neighbor);
				}
			}
		}
	}() ];
	const spot = spots[Math.floor(Math.random() * spots.length)];
	if (spot === undefined) {
		return false;
	}
	context.place(createKeeperLair(spot), 'keeperLair');
	return true;
}

// Lairs run after every guarded object is placed, so the mineral's guard needs no knowledge of the
// mineral mod -- any tile tagged 'guarded' gets one.
hooks.register('roomGenerator', {
	order: 3,
	generate(context) {
		if (context.options.keeperLairs !== true) {
			return true;
		}
		for (const position of iterateArea(context.room.name, 0, 0, 49, 49)) {
			if (context.tagsAt(position).has('guarded') && !placeKeeperLair(context, position)) {
				return false;
			}
		}
		return true;
	},
});

declare module 'xxscreeps/scripts/symbols.js' {
	interface GenerateRoomOptions {
		/** Number of sources; omit for a random 1 or 2. */
		sources?: number;
		/** Whether keeper lairs guard each source and the mineral. Default is false. */
		keeperLairs?: boolean;
	}
}
