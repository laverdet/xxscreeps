import type { GameMap, World } from './map.js';
import type { RoomObject } from './object.js';
import type { AnyRoomObject, Room } from './room/index.js';
import type { TickPayload } from 'xxscreeps/engine/runner/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from './constants/index.js';
import { hooks } from './symbols.js';

const initializeGame = hooks.makeIterated('gameInitializer');
const initializeRoom = hooks.makeIterated('roomInitializer');

/**
 * Underlying game state holder for a tick. Multiple `Game` objects can share this per tick, for
 * instance a processor might have multiple `Game` objects for each user but only one `GameState`
 * per-room per-tick.
 */
export class GameState {
	readonly world;
	readonly time;
	readonly objects: Map<string, RoomObject>;
	readonly rooms: Record<string, Room>;

	constructor(world: World, time: number, rooms: Room[]) {
		this.world = world;
		this.time = time;
		this.objects = Fn.pipe(
			rooms,
			$$ => Fn.transform($$, room => Fn.map(room['#objects'], object => [ object.id, object ] as const)),
			$$ => new Map($$));
		this.rooms = Fn.fromEntries(Fn.map(rooms, room => [ room.name, room ]));
		for (const room of Object.values(this.rooms)) {
			initializeRoom(room, this);
		}
	}

	insertObject(object: RoomObject) {
		this.objects.set(object.id, object);
	}
}

/**
 * `Game` object used by various engine methods.
 */
export class GameBase {
	/**
	 * A hash containing all the rooms available to you with room names as hash keys. A room is
	 * visible if you have a creep or an owned structure in it.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.rooms
	 */
	readonly rooms: Record<string, Room>;

	/**
	 * System game tick counter. It is automatically incremented on every tick.
	 * [Learn more](https://docs.screeps.com/game-loop.html)
	 * @public
	 * @see https://docs.screeps.com/api/#Game.time
	 */
	readonly time: number;

	/**
	 * A global object representing world map. See the
	 * [documentation](https://docs.screeps.com/api/#Game-map) below.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map
	 */
	readonly map: GameMap;

	readonly #state: GameState;

	constructor(state: GameState) {
		this.rooms = state.rooms;
		this.time = state.time;
		this.map = state.world.map;
		this.#state = state;
		this.getObjectById = this.getObjectById.bind(this);
	}

	/**
	 * Get an object with the specified unique ID. It may be a game object of any type. Only objects
	 * from the rooms which are visible to you can be accessed.
	 * @param id The unique identifier.
	 * @returns Returns an object instance or null if it cannot be found.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.getObjectById
	 */
	getObjectById<Type extends RoomObject = AnyRoomObject>(id: string) {
		return (this.#state.objects.get(id) ?? null) as Type | null;
	}
}

/**
 * The main global game object containing all the game play information.
 * @public
 * @see https://docs.screeps.com/api/#Game
 */
export class Game extends GameBase {
	/**
	 * A global object containing information about your CPU usage and methods. See the
	 * [documentation](https://docs.screeps.com/api/#Game-cpu) below.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.cpu
	 */
	declare cpu: CPU;

	/**
	 * An object describing the world shard where your script is currently being executed in.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.shard
	 */
	shard: {
		/**
		 * The name of the shard.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.shard.name
		 */
		name: string;

		/**
		 * Currently always equals to `normal`.
		 * @public
		 * @see https://docs.screeps.com/api/#Game.shard.type
		 */
		type: string;

		/**
		 * Whether this shard belongs to the [PTR](https://docs.screeps.com/ptr.html).
		 * @public
		 * @see https://docs.screeps.com/api/#Game.shard.ptr
		 */
		ptr: boolean;
	};

	/**
	 * Your Global Power Level, an object with the following properties: `level` — the current level;
	 * `progress` — the current progress to the next level; `progressTotal` — the progress required to
	 * reach the next level.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.gpl
	 */
	gpl = { level: 0, progress: 0, progressTotal: Infinity };

	constructor(state: GameState, data?: TickPayload) {
		super(state);

		// Shard info
		this.shard = {
			name: state.world.name,
			type: 'normal',
			ptr: false,
		};

		// Run hooks
		initializeGame(this, data);
		for (const room of Object.values(state.rooms)) {
			for (const object of room['#objects']) {
				if ((object as any).my) {
					object['#addToMyGame'](this);
				}
			}
		}
	}

	/**
	 * Alias for `Game.cpu.limit`.
	 * @public
	 * @deprecated
	 * @see https://docs.screeps.com/api/#Game.cpu.limit
	 */
	get cpuLimit(): number { return this.cpu.limit; }

	/**
	 * Send a custom message at your profile email. This way, you can set up notifications to yourself
	 * on any occasion within the game. You can schedule up to 20 notifications during one game tick.
	 * Not available in the Simulation Room.
	 * @param message Custom text which will be sent in the message. Maximum length is 1000
	 * characters.
	 * @param groupInterval If set to 0 (default), the notification will be scheduled immediately.
	 * Otherwise, it will be grouped with other notifications and mailed out later using the specified
	 * time in minutes.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.notify
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	notify(message: string, groupInterval?: number): number {
		console.warn('Game.notify: notifications mod not installed');
		return C.OK;
	}
}

/**
 * A global object containing information about your CPU usage.
 * @public
 * @see https://docs.screeps.com/api/#Game-cpu
 */
export interface CPU {
	/**
	 * An amount of unused CPU accumulated in your
	 * [bucket](https://docs.screeps.com/cpu-limit.html#Bucket).
	 * @public
	 * @see https://docs.screeps.com/api/#Game.cpu.bucket
	 */
	bucket: number;

	/**
	 * Your assigned CPU limit for the current shard.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.cpu.limit
	 */
	limit: number;

	/**
	 * An amount of available CPU time at the current game tick. Usually it is higher than
	 * `Game.cpu.limit`. [Learn more](https://docs.screeps.com/cpu-limit.html)
	 * @public
	 * @see https://docs.screeps.com/api/#Game.cpu.tickLimit
	 */
	tickLimit: number;

	/**
	 * Get amount of CPU time used from the beginning of the current game tick. Always returns 0 in
	 * the Simulation mode.
	 * @returns Returns currently used CPU time as a float number.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.cpu.getUsed
	 */
	getUsed: () => number;
}
