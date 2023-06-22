import type { GameMap, World } from './map.js';
import type { AnyRoomObject, Room } from './room/index.js';
import type { RoomObject } from './object.js';
import type { TickPayload } from 'xxscreeps/engine/runner';
import Fn from 'xxscreeps/utility/functional.js';
import { hooks } from './symbols.js';

const initializeGame = hooks.makeIterated('gameInitializer');
const initializeRoom = hooks.makeIterated('roomInitializer');

/**
 * Underlying game state holder for a tick. Multiple `Game` objects can share this per tick, for
 * instance a processor might have multiple `Game` objects for each user but only one `GameState`
 * per-room per-tick.
 */
export class GameState {
	readonly objects: Map<string, RoomObject>;
	readonly rooms: Record<string, Room>;

	constructor(
		public readonly world: World,
		public readonly time: number,
		rooms: Room[],
	) {
		this.objects = new Map(Fn.concat(Fn.map(rooms, room =>
			Fn.map(room['#objects'], object => [ object.id, object ]))));
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
	readonly rooms: Record<string, Room>;
	readonly time: number;
	readonly map: GameMap;
	#state: GameState;

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
	 * @param id The unique identifier
	 */
	getObjectById<Type extends RoomObject = AnyRoomObject>(id: string) {
		return (this.#state.objects.get(id) ?? null) as Type | null;
	}
}

/**
 * The main global game object containing all the game play information.
 */
export class Game extends GameBase {
	/**
	 * An object containing information about your CPU usage.
	 */
	declare cpu: CPU;

	/**
	 * An object describing the world shard where your script is currently being executed in.
	 */
	shard: { name: string; type: string; ptr: boolean };

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
	 * Send a custom message at your profile email. This way, you can set up notifications to yourself
	 * on any occasion within the game. You can schedule up to 20 notifications during one game tick.
	 * Not available in the Simulation Room.
	 */
	notify(_message: string, _groupInterval?: number) {
		console.error('TODO: notify');
	}
}

export interface CPU {
	/**
	 * An amount of unused CPU accumulated in your [bucket](https://docs.screeps.com/cpu-limit.html#Bucket).
	 */
	bucket: number;

	/**
	 * Your assigned CPU limit for the current shard.
	 */
	limit: number;

	/**
	 * An amount of available CPU time at the current game tick. Usually it is higher than
	 * `Game.cpu.limit`. [Learn more](https://docs.screeps.com/cpu-limit.html)
	 */
	tickLimit: number;

	/**
	 * Get amount of CPU time used from the beginning of the current game tick. Always returns 0 in
	 * the Simulation mode.
	 */
	getUsed(): number;
}
