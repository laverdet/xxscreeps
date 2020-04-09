import * as C from './constants';
import type { InspectOptionsStylized } from 'util';

import { BufferObject } from '~/lib/schema/buffer-object';
import type { BufferView } from '~/lib/schema/buffer-view';
import { withOverlay } from '~/lib/schema';
import { accumulate, concatInPlace } from '~/lib/utility';
import { Process, ProcessorSpecification, Tick } from '~/engine/processor/bind';
import type { shape } from '~/engine/schema/room';
import { iteratee } from '~/engine/util/iteratee';

import * as Game from './game';
import * as Memory from './memory';
import { fetchArguments, iterateNeighbors, RoomPosition } from './position';
import * as PathFinder from './path-finder';
import { getTerrainForRoom } from './map';
import { isBorder, isNearBorder } from './terrain';

import { ConstructionSite, ConstructibleStructureType } from './objects/construction-site';
import { Creep } from './objects/creep';
import { chainIntentChecks, RoomObject } from './objects/room-object';
import { Source } from './objects/source';
import { Structure } from './objects/structures';
import { StructureController } from './objects/structures/controller';
import { StructureExtension } from './objects/structures/extension';
import { StructureSpawn } from './objects/structures/spawn';
import { RoomVisual } from './visual';

export type AnyRoomObject = InstanceType<typeof Room>['_objects'][number];
type ExitDirection =
	typeof C.FIND_EXIT_TOP |
	typeof C.FIND_EXIT_RIGHT |
	typeof C.FIND_EXIT_BOTTOM |
	typeof C.FIND_EXIT_LEFT;

export type FindPathOptions = PathFinder.RoomSearchOptions & {
	serialize?: boolean;
};
export type RoomFindOptions = {
	filter?: string | object | ((object: RoomObject) => boolean);
};

export type RoomFindObjectType<Type extends number> =
	Type extends
		typeof C.FIND_CREEPS |
		typeof C.FIND_MY_CREEPS |
		typeof C.FIND_HOSTILE_CREEPS ?
	Creep :
	Type extends
		typeof C.FIND_STRUCTURES |
		typeof C.FIND_MY_STRUCTURES |
		typeof C.FIND_HOSTILE_STRUCTURES ?
	Extract<AnyRoomObject, Structure> :
	Type extends
		typeof C.FIND_CONSTRUCTION_SITES |
		typeof C.FIND_MY_CONSTRUCTION_SITES |
		typeof C.FIND_HOSTILE_CONSTRUCTION_SITES ?
	ConstructionSite :
	Type extends
		typeof C.FIND_SOURCES |
		typeof C.FIND_SOURCES_ACTIVE ?
	Source :
	RoomObject;

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

	#constructionSites: ConstructionSite[] = [];
	#creeps: Creep[] = [];
	#sources: Source[] = [];
	#structures: Structure[] = [];

	constructor(view: BufferView, offset = 0) {
		super(view, offset);
		for (const object of this._objects) {
			object.room = this;
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
	#findCache = new Map<number, RoomObject[]>();
	find<Type extends number>(type: Type, options: RoomFindOptions = {}): RoomFindObjectType<Type>[] {
		// Check find cache
		let results = this.#findCache.get(type);
		if (results === undefined) {

			// Generate list
			results = (() => {
				switch (type) {
					case C.FIND_CONSTRUCTION_SITES: return this.#constructionSites;
					case C.FIND_MY_CONSTRUCTION_SITES: return this.#constructionSites.filter(constructionSite => constructionSite.my);
					case C.FIND_HOSTILE_CONSTRUCTION_SITES: return this.#constructionSites.filter(constructionSite => !constructionSite.my);

					case C.FIND_CREEPS: return this.#creeps;
					case C.FIND_MY_CREEPS: return this.#creeps.filter(creep => creep.my);
					case C.FIND_HOSTILE_CREEPS: return this.#creeps.filter(creep => !creep.my);

					case C.FIND_SOURCES: return this.#sources;
					case C.FIND_SOURCES_ACTIVE: return this.#sources.filter(source => source.energy > 0);

					case C.FIND_STRUCTURES: return this.#structures;
					case C.FIND_MY_STRUCTURES: return this.#structures.filter(structure => structure.my);
					case C.FIND_HOSTILE_STRUCTURES: return this.#structures.filter(structure => !structure.my);

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
	findExitTo(/*room: Room | string*/): ExitDirection | typeof C.ERR_NO_PATH | typeof C.ERR_INVALID_ARGS {
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

	// `_wasInserted` and `_wasRemoved` are called "externally" from intent processors to notify the
	// class that `._objects` has been changed. This clears the `.find` caches
	protected _wasInserted(object: AnyRoomObject) {
		this._afterInsertion(object);
		for (const find of getFindConstantsForObject(object)) {
			this.#findCache.delete(find);
		}
	}

	protected _wasRemoved(object: AnyRoomObject) {
		this._afterRemoval(object);
		for (const find of getFindConstantsForObject(object)) {
			this.#findCache.delete(find);
		}
	}

	// `_afterInsertion` and `_afterRemoval` should only be called from this file to add or remove
	// objects from the type-based list manifests
	private _afterInsertion(object: AnyRoomObject) {
		object.room = this;
		if (object instanceof Structure) {
			this.#structures.push(object);
			if (object instanceof StructureController) {
				this.controller = object;
			} else if (object instanceof StructureExtension || object instanceof StructureSpawn) {
				this.energyAvailable += object.store[C.RESOURCE_ENERGY];
				this.energyCapacityAvailable += object.store.getCapacity(C.RESOURCE_ENERGY);
			}
		} else if (object instanceof Creep) {
			this.#creeps.push(object);
		} else if (object instanceof Source) {
			this.#sources.push(object);
		} else if (object instanceof ConstructionSite) {
			this.#constructionSites.push(object);
		}
	}

	private _afterRemoval(object: AnyRoomObject) {
		object.room = null as any as Room;
		if (object instanceof Structure) {
			removeOne(this.#structures, object);
			if (object instanceof StructureController) {
				this.controller = undefined;
			} else if (object instanceof StructureExtension || object instanceof StructureSpawn) {
				this.energyAvailable -= object.store[C.RESOURCE_ENERGY];
				this.energyCapacityAvailable -= object.store.getCapacity(C.RESOURCE_ENERGY);
			}
		} else if (object instanceof Creep) {
			removeOne(this.#creeps, object);
		} else if (object instanceof Source) {
			removeOne(this.#sources, object);
		} else if (object instanceof ConstructionSite) {
			removeOne(this.#constructionSites, object);
		}
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
// Utilities
function getFindConstantsForObject(object: RoomObject) {
	if (object instanceof Structure) {
		return [ C.FIND_STRUCTURES, C.FIND_MY_STRUCTURES, C.FIND_HOSTILE_STRUCTURES ];

	} else if (object instanceof Creep) {
		return [ C.FIND_CREEPS, C.FIND_MY_CREEPS, C.FIND_HOSTILE_CREEPS ];

	} else if (object instanceof ConstructionSite) {
		return [ C.FIND_CONSTRUCTION_SITES, C.FIND_MY_CONSTRUCTION_SITES, C.FIND_HOSTILE_CONSTRUCTION_SITES ];

	} else if (object instanceof Source) {
		return [ C.FIND_SOURCES, C.FIND_SOURCES_ACTIVE ];
	}
	return [];
}

function removeOne<Type>(list: Type[], element: Type) {
	const index = list.indexOf(element);
	if (index === -1) {
		throw new Error('Removed object was not found');
	}
	list.splice(index, 1);
}
