import type { RoomGeneratorContext } from 'xxscreeps/scripts/symbols.js';
import { makeLocalIterateArea, makeLocalIterateInRangeTo } from 'xxscreeps/game/direction.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { isBorder } from 'xxscreeps/game/terrain.js';
import { hooks } from 'xxscreeps/scripts/symbols.js';
import * as C from './constants.js';
import { create as createKeeperLair } from './keeper-lair.js';
import { Source } from './source.js';

const iterateGrid = makeLocalIterateArea(0, 49);
const iterateGridInRange = makeLocalIterateInRangeTo(0, 49);

// Keeper and center rooms (the controller-less ones) bake their sources' 4000 energy capacity at
// generation: Source's '#roomStatusDidChange' computes the same thing from the room owner, but the
// controller processor that drives that hook never runs for a controller-less room.
hooks.register('roomGenerator', {
	order: 0,
	generate(context) {
		const { options, room } = context;
		const count = options.sources ?? (Math.random() > 0.5 ? 1 : 2);
		const energyCapacity = options.controller === false
			? C.SOURCE_ENERGY_KEEPER_CAPACITY
			: C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
		for (let ii = 0; ii < count; ++ii) {
			const tile = context.findRandomTile(3, 44, context.isPlaceable);
			if (tile === undefined) {
				return false;
			}
			const source = createRoomObject(new Source(), new RoomPosition(tile[0], tile[1], room.name));
			source.energy = source.energyCapacity = energyCapacity;
			context.place(source, 'source', 'guarded');
		}
		return true;
	},
});

// Searches outward from (xx, yy) through passable terrain for a non-border wall tile 3 to 5 steps
// away to host a keeper lair, placing one on a uniformly random candidate. Returns false when no
// tile qualifies, signalling the caller to regenerate.
function placeKeeperLair(context: RoomGeneratorContext, xx: number, yy: number): boolean {
	const visited = new Map([ [ yy * 50 + xx, 0 ] ]);
	const stack = [ [ xx, yy ] as const ];
	const spots = [ ...function*(): Iterable<readonly [ number, number ]> {
		while (stack.length > 0) {
			const [ cxx, cyy ] = stack.pop()!;
			const distance = visited.get(cyy * 50 + cxx)! + 1;
			for (const [ nxx, nyy ] of iterateGridInRange(cxx, cyy, 1)) {
				const key = nyy * 50 + nxx;
				if (visited.has(key)) {
					continue;
				}
				visited.set(key, distance);
				if (distance >= 3 && distance <= 5 && !isBorder(nxx, nyy) && context.isPlaceable(nxx, nyy)) {
					yield [ nxx, nyy ];
				}
				if (!context.isWall(nxx, nyy) && distance < 5) {
					stack.push([ nxx, nyy ]);
				}
			}
		}
	}() ];
	const spot = spots[Math.floor(Math.random() * spots.length)];
	if (spot === undefined) {
		return false;
	}
	context.place(createKeeperLair(new RoomPosition(spot[0], spot[1], context.room.name)), 'keeperLair');
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
		for (const [ xx, yy ] of iterateGrid(0, 0, 49, 49)) {
			if (context.tagsAt(xx, yy).has('guarded') && !placeKeeperLair(context, xx, yy)) {
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
