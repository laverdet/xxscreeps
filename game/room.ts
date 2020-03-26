import { BufferObject } from '~/engine/schema/buffer-object';
import type { BufferView } from '~/engine/schema/buffer-view';
import { checkCast, makeVector, withType, Format, Interceptor } from '~/engine/schema';
import { iteratee } from '~/engine/util/iteratee';
import { variantFormat } from './objects/room-object-variant';

import { RoomObject } from './objects/room-object';
import type { RoomPosition } from './position';
import * as PathFinder from './path-finder';

import { Creep } from './objects/creep';
import { Source } from './objects/source';
import { Structure } from './objects/structures';
import { StructureController } from './objects/structures/controller';
import { StructureSpawn } from './objects/structures/spawn';

import * as C from './constants';

export const format = withType<Room>(checkCast<Format>()({
	name: 'string',
	objects: makeVector(variantFormat),
}));

export const Objects = Symbol('objects');

export class Room extends BufferObject {
	controller?: StructureController;
	name!: string;
	[Objects]!: RoomObject[];

	energyAvailable = 0;
	energyCapacityAvailable = 0;

	#creeps: Creep[] = [];
	#sources: Source[] = [];
	#structures: Structure[] = [];

	constructor(view: BufferView, offset = 0) {
		super(view, offset);
		for (const object of this[Objects]) {
			object.room = this;
			if (object instanceof Structure) {
				this.#structures.push(object);
				if (object instanceof StructureController) {
					this.controller = object;
				} else if (object instanceof StructureSpawn) {
					this.energyAvailable += object.store[C.RESOURCE_ENERGY];
					this.energyCapacityAvailable += object.store.getCapacity(C.RESOURCE_ENERGY);
				}
			} else if (object instanceof Creep) {
				this.#creeps.push(object);
			} else if (object instanceof Source) {
				this.#sources.push(object);
			}
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
	find(type: number, opts: { filter?: any } = {}) {
		// Check find cache
		let results = this.#findCache.get(type);
		if (results === undefined) {

			// Generate list
			results = (() => {
				switch (type) {
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
			})() as RoomObject[];

			// Add to cache
			this.#findCache.set(type, results);
		}

		// Copy or filter result
		return opts.filter === undefined ? results.slice() : results.filter(iteratee(opts.filter));
	}

	findPath(fromPos: RoomPosition, toPos: RoomPosition) {
		const result = PathFinder.search(fromPos, { pos: toPos, range: 1 });
		const path: any[] = [];
		let previous = fromPos;
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
}

export const interceptors = {
	Room: checkCast<Interceptor>()({
		members: {
			objects: { symbol: Objects },
		},
		overlay: Room,
	}),
};

export const schemaFormat = { Room: format };
