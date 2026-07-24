declare module 'xxscreeps:mods/game' {
	import type { PositionParameter, RoomPosition } from 'xxscreeps/game/position.js';
	import type { GameEvent } from 'xxscreeps/game/room/event-log.js';
	import type { ExitFind } from 'xxscreeps/game/room/find.js';
	import type { LookAsArray, LookAtArea, LookAtResult, LookConstants, LookForAtArea, TypeOfLook } from 'xxscreeps/game/room/look.js';
	import type { FindPathOptions, RoomPath } from 'xxscreeps/game/room/path.js';
	import type { Room as RoomInterface } from 'xxscreeps/game/room/room.js';
	import type { Terrain } from 'xxscreeps/game/terrain.js';

	enum ActionLogSchema {}
	interface Find { exit: ExitFind }

	interface RoomConstructor {
		/**
		 * Serialize a path array into a short string representation, which is suitable to store in
		 * memory.
		 * @param path A path array retrieved from
		 * [`Room.findPath`](https://docs.screeps.com/api/#Room.findPath).
		 * @returns A serialized string form of the given path.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.serializePath
		 */
		serializePath: (path: RoomPath) => string;

		/**
		 * Deserialize a short string path representation into an array form.
		 * @param path A serialized path string.
		 * @returns A path array.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.deserializePath
		 */
		deserializePath: (path: string) => RoomPath;

		/**
		 * An object which provides fast access to room terrain data. These objects can be constructed for
		 * any room in the world even if you have no access to it.
		 * @public
		 * @see https://docs.screeps.com/api/#Room-Terrain
		 */
		Terrain: typeof Terrain;
	}

	interface Room {
		/**
		 * Find the exit direction en route to another room. Please note that this method is not
		 * required for inter-room movement, you can simply pass the target in another room into
		 * [`Creep.moveTo`](https://docs.screeps.com/api/#Creep.moveTo) method.
		 * @param room Another room name or room object.
		 * @returns The room direction constant, one of the following: `FIND_EXIT_TOP`,
		 * `FIND_EXIT_RIGHT`, `FIND_EXIT_BOTTOM`, `FIND_EXIT_LEFT`. Or one of the following error codes:
		 * `ERR_NO_PATH`, `ERR_INVALID_ARGS`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.findExitTo
		 */
		findExitTo: (room: RoomInterface | string) => any;

		/**
		 * Find an optimal path inside the room between fromPos and toPos using [Jump Point Search
		 * algorithm](http://en.wikipedia.org/wiki/Jump_point_search).
		 * @param origin The start position.
		 * @param goal The end position.
		 * @param options An object of {@link FindPathOptions}.
		 * @returns An array with path steps in the following format:
		 * `[ { x: 10, y: 5, dx: 1, dy: 0, direction: RIGHT }, ... ]`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.findPath
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize?: false }): RoomPath;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize: true }): string;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions): RoomPath | string;

		/**
		 * Returns an array of events happened on the previous tick in this room.
		 * @param raw If this parameter is false or undefined, the method returns a parsed array of
		 * event objects. If `raw` is truthy, then raw JSON in string format is returned.
		 * @returns An array of events. Each event represents some game action in the following format:
		 * `{ event: EVENT_ATTACK, objectId: '54bff72ab32a10f73a57d017', data: { ... } }`. The `data`
		 * property is different for each event type, see the
		 * [official documentation](https://docs.screeps.com/api/#Room.getEventLog) for details.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.getEventLog
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		getEventLog(raw: true): string;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		getEventLog(raw?: false): GameEvent[];

		/**
		 * Get a [`Room.Terrain`](https://docs.screeps.com/api/#Room-Terrain) object which provides fast
		 * access to static terrain data. This method works for any room in the world even if you have
		 * no access to it.
		 * @returns Returns new [`Room.Terrain`](https://docs.screeps.com/api/#Room-Terrain) object.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.getTerrain
		 */
		// eslint-disable-next-line @typescript-eslint/member-ordering
		getTerrain: () => Terrain;

		/**
		 * Get the list of objects at the specified room position.
		 * @param args `(x, y)` coordinates in the room, or a
		 * [RoomPosition](https://docs.screeps.com/api/#RoomPosition) object or any object containing
		 * RoomPosition.
		 * @returns An array with objects at the specified position in the following format:
		 * `[ { type: 'creep', creep: {...} }, { type: 'terrain', terrain: 'swamp' }, ... ]`
		 * @public
		 * @see https://docs.screeps.com/api/#Room.lookAt
		 */
		// eslint-disable-next-line @typescript-eslint/member-ordering
		lookAt: (...args: PositionParameter) => LookAtResult<any>[];

		/**
		 * Creates a [RoomPosition](https://docs.screeps.com/api/#RoomPosition) object at the specified
		 * location.
		 * @param x The X position.
		 * @param y The Y position.
		 * @returns A [RoomPosition](https://docs.screeps.com/api/#RoomPosition) object or null if it
		 * cannot be obtained.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.getPositionAt
		 */
		// eslint-disable-next-line @typescript-eslint/member-ordering
		getPositionAt: (x: number, y: number) => RoomPosition;

		/**
		 * Get the list of objects at the specified room area.
		 * @param top The top Y boundary of the area.
		 * @param left The left X boundary of the area.
		 * @param bottom The bottom Y boundary of the area.
		 * @param right The right X boundary of the area.
		 * @param asArray Set to true if you want to get the result as a plain array.
		 * @returns If `asArray` is set to false or undefined, the method returns an object with all the
		 * objects in the specified area keyed by `y` then `x` coordinate. If `asArray` is set to true,
		 * the method returns an array of look results with `x` and `y` properties.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.lookAtArea
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookAtArea(top: number, left: number, bottom: number, right: number, asArray?: false): LookAtArea<LookAtResult<any>>;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookAtArea(top: number, left: number, bottom: number, right: number, asArray: boolean): LookAsArray<LookAtResult<any>>;

		/**
		 * Get an object with the given type at the specified room position.
		 * @param type One of the `LOOK_*` constants.
		 * @param rest `(x, y)` coordinates in the room, or a
		 * [RoomPosition](https://docs.screeps.com/api/#RoomPosition) object or any object containing
		 * RoomPosition.
		 * @returns An array of objects of the given type at the specified position if found.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.lookForAt
		 */
		// eslint-disable-next-line @typescript-eslint/member-ordering
		lookForAt: <Type extends LookConstants>(type: Type, ...rest: PositionParameter) => TypeOfLook<Type>[];

		/**
		 * Get the list of objects with the given type at the specified room area.
		 * @param type One of the `LOOK_*` constants.
		 * @param top The top Y boundary of the area.
		 * @param left The left X boundary of the area.
		 * @param bottom The bottom Y boundary of the area.
		 * @param right The right X boundary of the area.
		 * @param asArray Set to true if you want to get the result as a plain array.
		 * @returns If `asArray` is set to false or undefined, the method returns an object with all the
		 * objects of the given type in the specified area keyed by `y` then `x` coordinate. If
		 * `asArray` is set to true, the method returns an array of found objects with `x` and `y`
		 * properties.
		 * @public
		 * @see https://docs.screeps.com/api/#Room.lookForAtArea
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookForAtArea<Type extends LookConstants>(type: Type, top: number, left: number, bottom: number, right: number, asArray?: false): LookAtArea<LookForAtArea<Type>>;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookForAtArea<Type extends LookConstants>(type: Type, top: number, left: number, bottom: number, right: number, asArray: boolean): LookAsArray<LookForAtArea<Type>>;
	}
}
