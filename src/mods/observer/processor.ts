import C from 'xxscreeps/game/constants/index.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { StructureObserver, checkObserveRoom } from 'xxscreeps/mods/observer/observer.js';
import { ObserverSpy, create as createObserverSpy } from 'xxscreeps/mods/observer/observer-spy.js';

declare module 'xxscreeps/engine/processor' {
	interface Intent { observer: typeof intents }
}

const intents = [
	registerIntentProcessor(StructureObserver, 'observeRoom', {}, (observer, context, target: string) => {
		if (checkObserveRoom(observer, target) === C.OK) {
			context.sendRoomIntent(target, 'observerObserve', observer['#user']!);
		}
	}),

	registerIntentProcessor(Room, 'observerObserve', { internal: true }, (room, context, user: string) => {
		const spy = createObserverSpy(new RoomPosition(1, 1, room.name), user);
		room['#insertObject'](spy);
		context.setActive();
	}),
];

registerObjectTickProcessor(ObserverSpy, (spy, context) => {
	spy.room['#removeObject'](spy);
	context.didUpdate();
});
