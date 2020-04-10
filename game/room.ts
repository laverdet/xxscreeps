import * as C from './constants';
import type { InspectOptionsStylized } from 'util';

import { BufferObject } from '~/lib/schema/buffer-object';
import type { BufferView } from '~/lib/schema/buffer-view';
import { withOverlay } from '~/lib/schema';
import { accumulate, concatInPlace, exchange, mapInPlace, mapToKeys, uncurryThis } from '~/lib/utility';
import { Process, ProcessorSpecification, Tick } from '~/engine/processor/bind';
import type { shape } from '~/engine/schema/room';
import { iteratee } from '~/engine/util/iteratee';

import * as Game from './game';
import * as Memory from './memory';
import { fetchArguments, fetchPositionArgument, iterateNeighbors, RoomPosition, PositionInteger } from './position';
import * as PathFinder from './path-finder';
import { getTerrainForRoom } from './map';
import { isBorder, isNearBorder } from './terrain';

import { ConstructionSite, ConstructibleStructureType } from './objects/construction-site';
import { Creep } from './objects/creep';
import { chainIntentChecks, RoomObject } from './objects/room-object';
import type { Resource } from './objects/resource';
import type { Source } from './objects/source';
import type { Structure } from './objects/structures';
import { StructureController } from './objects/structures/controller';
import { StructureExtension } from './objects/structures/extension';
import { StructureSpawn } from './objects/structures/spawn';
import { RoomVisual } from './visual';

export type AnyRoomObject = InstanceType<typeof Room>['_objects'][number];

const findToLook = Object.freeze({
	[C.FIND_CREEPS]: C.LOOK_CREEPS,
	[C.FIND_MY_CREEPS]: C.LOOK_CREEPS,
	[C.FIND_HOSTILE_CREEPS]: C.LOOK_CREEPS,
	[C.FIND_SOURCES_ACTIVE]: C.LOOK_SOURCES,
	[C.FIND_SOURCES]: C.LOOK_SOURCES,
	[C.FIND_DROPPED_RESOURCES]: C.LOOK_RESOURCES,
	[C.FIND_STRUCTURES]: C.LOOK_STRUCTURES,
	[C.FIND_MY_STRUCTURES]: C.LOOK_STRUCTURES,
	[C.FIND_HOSTILE_STRUCTURES]: C.LOOK_STRUCTURES,
	[C.FIND_FLAGS]: C.LOOK_FLAGS,
	[C.FIND_CONSTRUCTION_SITES]: C.LOOK_CONSTRUCTION_SITES,
	[C.FIND_MY_SPAWNS]: C.LOOK_STRUCTURES,
	[C.FIND_HOSTILE_SPAWNS]: C.LOOK_STRUCTURES,
	[C.FIND_MY_CONSTRUCTION_SITES]: C.LOOK_CONSTRUCTION_SITES,
	[C.FIND_HOSTILE_CONSTRUCTION_SITES]: C.LOOK_CONSTRUCTION_SITES,
	[C.FIND_MINERALS]: C.LOOK_MINERALS,
	[C.FIND_NUKES]: C.LOOK_NUKES,
	[C.FIND_TOMBSTONES]: C.LOOK_TOMBSTONES,
	[C.FIND_POWER_CREEPS]: C.LOOK_POWER_CREEPS,
	[C.FIND_MY_POWER_CREEPS]: C.LOOK_POWER_CREEPS,
	[C.FIND_HOSTILE_POWER_CREEPS]: C.LOOK_POWER_CREEPS,
	[C.FIND_DEPOSITS]: C.LOOK_DEPOSITS,
	[C.FIND_RUINS]: C.LOOK_RUINS,
});

// Does not include LOOK_ENERGY
const lookConstants = new Set(Object.values(findToLook));
Object.freeze(lookConstants); // stupid typescript thing, must be frozen out of line to iterate

// LOOK_* constant to array of FIND_* constants
const lookToFind: LookToFind = Object.freeze(mapToKeys(lookConstants, look => [ look, []]));

type FindExitDirection =
	typeof C.FIND_EXIT_TOP |
	typeof C.FIND_EXIT_RIGHT |
	typeof C.FIND_EXIT_BOTTOM |
	typeof C.FIND_EXIT_LEFT;

type FindExitConstants = FindExitDirection | typeof C.FIND_EXIT;

export type FindConstants =
	FindExitConstants |
	keyof typeof findToLook;

export type LookConstants = typeof findToLook extends Record<string, infer Look> ? Look : never;

type LookToFind = {
	[look in LookConstants]: {
		[find in keyof typeof findToLook]: typeof findToLook[find] extends look ? find : never;
	}[keyof typeof findToLook][];
};

export type RoomFindType<Type extends FindConstants> =
	Type extends FindExitConstants ? RoomPosition :
	Type extends typeof C.FIND_MY_SPAWNS | typeof C.FIND_HOSTILE_SPAWNS ? StructureSpawn :
	Type extends keyof typeof findToLook ? RoomLookType<typeof findToLook[Type]> :
	never;

type RoomLookType<Type extends LookConstants> =
	Type extends typeof C.LOOK_CONSTRUCTION_SITES ? ConstructionSite :
	Type extends typeof C.LOOK_CREEPS ? Creep :
	Type extends typeof C.LOOK_RESOURCES ? Resource :
	Type extends typeof C.LOOK_SOURCES ? Source :
	Type extends typeof C.LOOK_STRUCTURES ? Extract<AnyRoomObject, Structure> :
	never;

type RoomLookResult<Type extends LookConstants> = {
	[key in LookConstants]: RoomLookType<Type>;
} & {
	type: Type;
};

export type LookType<Type extends RoomObject> = {
	[key in LookConstants]: Type extends RoomLookType<key> ? Type : never;
} & {
	type: Type['_lookType'];
};

export type FindPathOptions = PathFinder.RoomSearchOptions & {
	serialize?: boolean;
};
export type RoomFindOptions<Type = any> = {
	filter?: string | object | ((object: Type) => LooseBoolean);
};

// Methods which will be extracted and exported
const MoveObject = Symbol('moveObject');
const InsertObject = Symbol('insertObject');
const RemoveObject = Symbol('removeObject');

export class Room extends withOverlay<typeof shape>()(BufferObject) {
	get memory() {
		const memory = Memory.get();
		const rooms = memory.rooms ?? (memory.rooms = {});
		return rooms[this.name] ?? (rooms[this.name] = {});
	}

	controller?: StructureController;
	[Process]?: ProcessorSpecification<this>['process'];
	[Tick]?: ProcessorSpecification<this>['tick'];

	energyAvailable = 0;
	energyCapacityAvailable = 0;

	constructor(view: BufferView, offset = 0) {
		super(view, offset);
		for (const object of this._objects) {
			this._afterInsertion(object);
		}
	}

	/**
	 * Find all objects of the specified type in the room. Results are cached automatically for the
	 * specified room and type before applying any custom filters. This automatic cache lasts until
	 * the end of the tick.
	 * @param type One of the FIND_* constants
	 * @param opts
	 */
	find<Type extends FindConstants>(
		type: Type,
		options: RoomFindOptions<RoomFindType<Type>> = {},
	): RoomFindType<Type>[] {
		// Check find cache
		let results = this.#findCache.get(type);
		if (results === undefined) {

			// Generate list
			results = (() => {
				switch (type) {
					// Exits
					case C.FIND_EXIT:
						return [
							...this.find(C.FIND_EXIT_TOP),
							...this.find(C.FIND_EXIT_RIGHT),
							...this.find(C.FIND_EXIT_BOTTOM),
							...this.find(C.FIND_EXIT_LEFT),
						];

					case C.FIND_EXIT_TOP:
					case C.FIND_EXIT_RIGHT:
					case C.FIND_EXIT_BOTTOM:
					case C.FIND_EXIT_LEFT: {
						const generators: {
							[key in FindExitDirection]: (ii: number) => RoomPosition
						} = {
							[C.FIND_EXIT_TOP]: ii => new RoomPosition(ii, 0, this.name),
							[C.FIND_EXIT_RIGHT]: ii => new RoomPosition(49, ii, this.name),
							[C.FIND_EXIT_BOTTOM]: ii => new RoomPosition(ii, 49, this.name),
							[C.FIND_EXIT_LEFT]: ii => new RoomPosition(0, ii, this.name),
						};
						const generator = generators[type as FindExitDirection];
						const results: RoomPosition[] = [];
						const terrain = this.getTerrain();
						for (let ii = 1; ii < 49; ++ii) {
							const pos = generator(ii);
							if (terrain.get(pos.x, pos.y) !== C.TERRAIN_MASK_WALL) {
								results.push(pos);
							}
						}
						return results;
					}

					// Construction sites
					case C.FIND_CONSTRUCTION_SITES:
						return this.#lookIndex.get(C.LOOK_CONSTRUCTION_SITES)!;
					case C.FIND_MY_CONSTRUCTION_SITES:
						return this.find(C.FIND_CONSTRUCTION_SITES).filter(constructionSite => constructionSite.my);
					case C.FIND_HOSTILE_CONSTRUCTION_SITES:
						return this.find(C.FIND_CONSTRUCTION_SITES).filter(constructionSite => !constructionSite.my);

					// Creeps
					case C.FIND_CREEPS:
						return this.#lookIndex.get(C.LOOK_CREEPS)!;
					case C.FIND_MY_CREEPS:
						return this.find(C.FIND_CREEPS).filter(creep => creep.my);
					case C.FIND_HOSTILE_CREEPS:
						return this.find(C.FIND_CREEPS).filter(creep => !creep.my);

					// Sources
					case C.FIND_SOURCES:
						return this.#lookIndex.get(C.LOOK_SOURCES)!;
					case C.FIND_SOURCES_ACTIVE:
						return this.find(C.FIND_SOURCES).filter(source => source.energy > 0);

					// Spawns
					case C.FIND_MY_SPAWNS:
						return this.#lookIndex.get(C.LOOK_STRUCTURES)!.filter((structure: Structure) =>
							structure.structureType === 'spawn' && structure.my);
					case C.FIND_HOSTILE_SPAWNS:
						return this.#lookIndex.get(C.LOOK_STRUCTURES)!.filter((structure: Structure) =>
							structure.structureType === 'spawn' && !structure.my);

					// Structures
					case C.FIND_STRUCTURES:
						return this.#lookIndex.get(C.LOOK_STRUCTURES)!;
					case C.FIND_MY_STRUCTURES:
						return this.find(C.FIND_STRUCTURES).filter(structure => structure.my);
					case C.FIND_HOSTILE_STRUCTURES:
						return this.find(C.FIND_STRUCTURES).filter(structure => !structure.my);

					default: return [];
				}
			})();

			// Add to cache
			this.#findCache.set(type, results);
		}

		// Copy or filter result
		return options.filter === undefined ? results.slice() : results.filter(iteratee(options.filter)) as any[];
	}

	/**
	 * Find the exit direction en route to another room. Please note that this method is not required
	 * for inter-room movement, you can simply pass the target in another room into Creep.moveTo
	 * method.
	 * @param room Another room name or room object
	 */
	findExitTo(/*room: Room | string*/): FindExitDirection | typeof C.ERR_NO_PATH | typeof C.ERR_INVALID_ARGS {
		return C.ERR_NO_PATH;
	}

	/**
	 * Find an optimal path inside the room between fromPos and toPos using Jump Point Search algorithm.
	 * @param origin The start position
	 * @param goal The end position
	 * @param options
	 */
	findPath(
		origin: RoomPosition, goal: RoomPosition,
		options: FindPathOptions & { serialize?: boolean } = {},
	) {
		// Delegate to `PathFinder` and convert the result
		const result = PathFinder.roomSearch(origin, [ goal ], options);
		const path: any[] = [];
		let previous = origin;
		for (const pos of result.path) {
			if (pos.roomName !== this.name) {
				break;
			}
			path.push({
				x: pos.x,
				y: pos.y,
				dx: pos.x - previous.x,
				dy: pos.y - previous.y,
				direction: previous.getDirectionTo(pos),
			});
			previous = pos;
		}
		return path;
	}

	/**
	 * Get a Room.Terrain object which provides fast access to static terrain data. This method works
	 * for any room in the world even if you have no access to it.
	 */
	getTerrain() {
		return getTerrainForRoom(this.name)!;
	}

	/**
	 * Get an object with the given type at the specified room position.
	 * @param type One of the `LOOK_*` constants
	 * @param x X position in the room
	 * @param y Y position in the room
	 * @param target Can be a RoomObject or RoomPosition
	 */
	lookForAt<Type extends LookConstants>(type: Type, x: number, y: number): RoomLookResult<Type>[];
	lookForAt<Type extends LookConstants>(type: Type, target: RoomObject | RoomPosition): RoomLookResult<Type>[];
	lookForAt<Type extends LookConstants>(
		type: Type, ...rest: [ number, number ] | [ RoomObject | RoomPosition ]
	) {
		const { pos } = fetchPositionArgument(this.name, ...rest);
		if (!pos || pos.roomName !== this.name) {
			return [];
		}
		if (!lookConstants.has(type)) {
			return C.ERR_INVALID_ARGS as any;
		}
		const objects = this._getSpatialIndex(type);
		return (objects.get(pos[PositionInteger]) ?? []).map(object => {
			const type = object._lookType;
			return { type, [type]: object };
		});
	}

	/**
	 * Create new `ConstructionSite` at the specified location.
	 * @param structureType One of the `STRUCTURE_*` constants.
	 * @param name The name of the structure, for structures that support it (currently only spawns).
	 */
	 createConstructionSite(x: number, y: number, structureType: ConstructibleStructureType, name?: string): number;
	 createConstructionSite(pos: RoomPosition, structureType: ConstructibleStructureType, name?: string): number;
	 createConstructionSite(...args: any[]) {

		// Extract overloaded parameters
		const { xx, yy, rest } = fetchArguments(...args);
		if (args[0] instanceof RoomPosition && args[0].roomName !== this.name) {
			return C.ERR_INVALID_ARGS;
		}
		const pos = new RoomPosition(xx, yy, this.name);
		const [ structureType, name ] = rest;

		// Send it off
		return chainIntentChecks(
			() => {
				if (structureType === 'spawn' && typeof name === 'string') {
					// TODO: Check newly created spawns too
					if (Game.spawns[name]) {
						return C.ERR_INVALID_ARGS;
					}
				}
				return C.OK;
			},
			() => checkCreateConstructionSite(this, pos, structureType),
			() => Game.intents.save(this, 'createConstructionSite', { name, structureType, xx, yy }));
	}

	get visual() {
		return new RoomVisual;
	}

	//
	// Private mutation functions
	[InsertObject](this: this, object: RoomObject) {
		// Add to objects & look index then flush find caches
		this._objects.push(object as AnyRoomObject);
		const lookType = this._afterInsertion(object);
		const findTypes = lookToFind[lookType];
		for (const find of findTypes) {
			this.#findCache.delete(find);
		}
		// Update spatial look cache if it exists
		const spatial = this.#lookSpatialIndex.get(lookType);
		if (spatial) {
			const pos = object.pos[PositionInteger];
			const list = spatial.get(pos);
			if (list) {
				list.push(object);
			} else {
				spatial.set(pos, [ object ]);
			}
		}
	}

	[RemoveObject](this: this, object: RoomObject) {
		// Remove from objects & look index then flush find caches
		removeOne(this._objects, object);
		const lookType = this._afterRemoval(object);
		const findTypes = lookToFind[lookType];
		for (const find of findTypes) {
			this.#findCache.delete(find);
		}
		// Update spatial look cache if it exists
		const spatial = this.#lookSpatialIndex.get(lookType);
		if (spatial) {
			const pos = object.pos[PositionInteger];
			const list = spatial.get(pos);
			if (list) {
				removeOne(list, object);
				if (list.length === 0) {
					spatial.delete(pos);
				}
			}
		}
	}

	[MoveObject](this: this, object: RoomObject, pos: RoomPosition) {
		const spatial = this.#lookSpatialIndex.get(object._lookType);
		if (spatial) {
			const oldPosition = object.pos[PositionInteger];
			const oldList = spatial.get(oldPosition)!;
			removeOne(oldList, object);
			if (oldList.length === 0) {
				spatial.delete(oldPosition);
			}
			object.pos = pos;
			const posInteger = pos[PositionInteger];
			const newList = spatial.get(posInteger);
			if (newList) {
				newList.push(object);
			} else {
				spatial.set(posInteger, [ object ]);
			}
		} else {
			object.pos = pos;
		}
	}

	// `_afterInsertion` is called on Room construction per object to batch add objects. It skips the
	// find cache and spatial indices because those will be clean anyway
	private _afterInsertion(object: RoomObject) {
		object.room = this;
		const lookType = object._lookType;
		const list = this.#lookIndex.get(lookType)!;
		list.push(object);
		if (lookType === C.LOOK_STRUCTURES) {
			if (object instanceof StructureController) {
				this.controller = object;
			} else if (object instanceof StructureExtension || object instanceof StructureSpawn) {
				this.energyAvailable += object.store[C.RESOURCE_ENERGY];
				this.energyCapacityAvailable += object.store.getCapacity(C.RESOURCE_ENERGY);
			}
		}
		return lookType;
	}

	private _afterRemoval(object: RoomObject) {
		object.room = null as any;
		const lookType = object._lookType;
		const list = this.#lookIndex.get(lookType)!;
		removeOne(list, object);
		if (lookType === C.LOOK_STRUCTURES) {
			if (object instanceof StructureController) {
				this.controller = object;
			} else if (object instanceof StructureExtension || object instanceof StructureSpawn) {
				this.energyAvailable -= object.store[C.RESOURCE_ENERGY];
				this.energyCapacityAvailable -= object.store.getCapacity(C.RESOURCE_ENERGY);
			}
		}
		return lookType;
	}

	// Returns objects indexed by type and position
	private _getSpatialIndex(look: LookConstants) {
		const cached = this.#lookSpatialIndex.get(look);
		if (cached) {
			return cached;
		}
		const spatial = new Map<number, RoomObject[]>();
		this.#lookSpatialIndex.set(look, spatial);
		for (const object of this.#lookIndex.get(look)!) {
			const pos = object.pos[PositionInteger];
			const list = spatial.get(pos);
			if (list) {
				list.push(object);
			} else {
				spatial.set(pos, [ object ]);
			}
		}
		return spatial;
	}

	//
	// Debug utilities
	toString() {
		return `[Room ${this.name}]`;
	}

	[Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptionsStylized) {
		// Every object has a `room` property so flatten this reference out unless it's a direct
		// inspection
		if (depth === options.depth) {
			return this;
		} else {
			return `[Room ${options.stylize(this.name, 'string')}]`;
		}
	}

	#findCache = new Map<number, (RoomObject | RoomPosition)[]>();
	#lookIndex = new Map<LookConstants, RoomObject[]>(
		mapInPlace(lookConstants, look => [ look, []]));
	#lookSpatialIndex = new Map<LookConstants, Map<number, RoomObject[]>>();
}

//
// Intent checks
export function checkCreateConstructionSite(room: Room, pos: RoomPosition, structureType: ConstructibleStructureType) {
	// Check `structureType` is buildable
	if (!(C.CONSTRUCTION_COST[structureType] > 0)) {
		return C.ERR_INVALID_ARGS;
	}

	// Can't build in someone else's room
	if (room.controller) {
		if (room.controller._owner !== undefined && !room.controller.my) {
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// Check structure count for this RCL
	const rcl = room.controller?.level ?? 0;
	if (rcl === 0 && structureType === 'spawn') {
		// TODO: GCL check here
		if (!room.controller) {
			return C.ERR_RCL_NOT_ENOUGH;
		}
	} else {
		const existingCount = accumulate(concatInPlace(
			room.find(C.FIND_STRUCTURES),
			room.find(C.FIND_CONSTRUCTION_SITES),
		), object => object.structureType === structureType ? 1 : 0);
		if (existingCount >= C.CONTROLLER_STRUCTURES[structureType][rcl]) {
			// TODO: Check constructions sites made this tick too
			return C.ERR_RCL_NOT_ENOUGH;
		}
	}

	// No structures on borders
	if (isNearBorder(pos.x, pos.y)) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures next to borders unless it's against a wall, or it's a road/container
	const terrain = room.getTerrain();
	if (structureType !== 'road' && structureType !== 'container' && isNearBorder(pos.x, pos.y)) {
		for (const neighbor of iterateNeighbors(pos)) {
			if (
				isBorder(neighbor.x, neighbor.y) &&
				terrain.get(neighbor.x, neighbor.y) !== C.TERRAIN_MASK_WALL
			) {
				return C.ERR_INVALID_TARGET;
			}
		}
	}

	// No structures on walls except for roads and extractors
	if (
		structureType !== 'extractor' && structureType !== 'road' &&
		terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL
	) {
		return C.ERR_INVALID_TARGET;
	}

	// No structures on top of others
	for (const object of concatInPlace(
		room.find(C.FIND_CONSTRUCTION_SITES),
		room.find(C.FIND_STRUCTURES),
	)) {
		if (
			object.pos.isEqualTo(pos) &&
			(object.structureType === structureType ||
				(structureType !== 'rampart' && structureType !== 'road' &&
				object.structureType !== 'rampart' && object.structureType !== 'road'))
		) {
			return C.ERR_INVALID_TARGET;
		}
	}

	// TODO: Extractors must be built on mineral
	// TODO: Limit total construction sites built

	return C.OK;
}

//
// Extracted private functions

// These must be functions in order to get hoisting. This shouldn't be needed after I can get real
// ES Module functionality working
const _moveObject = uncurryThis(exchange(Room.prototype, MoveObject));
export function moveObject(object: RoomObject, pos: RoomPosition) {
	return _moveObject(object.room, object, pos);
}

const _insertObject = uncurryThis(exchange(Room.prototype, InsertObject));
export function insertObject(room: Room, object: RoomObject) {
	return _insertObject(room, object);
}

const _removeObject = uncurryThis(exchange(Room.prototype, RemoveObject));
export function removeObject(object: RoomObject) {
	return _removeObject(object.room, object);
}

//
// Utilities
function removeOne<Type>(list: Type[], element: Type) {
	const index = list.indexOf(element);
	if (index === -1) {
		throw new Error('Removed object was not found');
	}
	list.splice(index, 1);
}
