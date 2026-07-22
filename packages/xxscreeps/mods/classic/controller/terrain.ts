import { createRoomObject } from 'xxscreeps/game/object.js';
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
		const position = context.findRandomPosition(5, 40, context.isPlaceable);
		if (position === undefined) {
			return false;
		}
		context.place(createRoomObject(new StructureController(), position), 'controller');
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
