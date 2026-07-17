import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { hooks } from 'xxscreeps/scripts/symbols.js';
import { StructureController } from './controller.js';

hooks.register('roomGenerator', {
	order: 1,
	generate(context) {
		const { options, room } = context;
		if (options.controller === false) {
			room['#level'] = -1;
			return true;
		}
		room['#user'] = null;
		room['#level'] = 0;
		const tile = context.findRandomTile(5, 40, context.isPlaceable);
		if (tile === undefined) {
			return false;
		}
		const controller = createRoomObject(new StructureController(), new RoomPosition(tile[0], tile[1], room.name));
		context.place(controller, 'controller');
		return true;
	},
});

declare module 'xxscreeps/scripts/symbols.js' {
	interface GenerateRoomOptions {
		/**
		 * Whether the room has a controller. Default is true. Controller-less rooms hold
		 * keeper-capacity sources and a prebuilt extractor.
		 */
		controller?: boolean;
	}
}
