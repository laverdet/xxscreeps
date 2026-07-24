import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import * as C from 'xxscreeps:mods/constants';
import { ObserverSpy, create as createObserverSpy } from './observer-spy.js';
import { StructureObserver, checkObserveRoom } from './observer.js';

export type ObserverIntents = typeof intents;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
