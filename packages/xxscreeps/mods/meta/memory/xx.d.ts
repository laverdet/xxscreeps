declare module 'xxscreeps:mods/game' {
	interface Room {
		/**
		 * A shorthand to `Memory.rooms[room.name]`. You can use it for quick access the room's specific
		 * memory data object.
		 * [Learn more about memory](https://docs.screeps.com/global-objects.html#Memory-object)
		 * @public
		 * @see https://docs.screeps.com/api/#Room.memory
		 */
		memory: any;
	}
}
