import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { RoomPosition } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { StructureObserver } from 'xxscreeps/mods/observer/observer';
import { ObserverSpy, create as createObserverSpy } from 'xxscreeps/mods/observer/observer_spy';

declare module 'xxscreeps/engine/processor' {
	interface Intent {observer: typeof intents}
}

const intents = [
	registerIntentProcessor(StructureObserver, 'observeRoom', {}, (observer, context, target: string) => {
		context.sendRoomIntent(target, 'observerObserve', observer['#user']!);
	}),

	registerIntentProcessor(Room, 'observerObserve', { internal: true }, (room, context, user: string) => {
		const spy = createObserverSpy(new RoomPosition(1, 1, room.name), user);
		room['#insertObject'](spy, true);
		context.didUpdate();
	}),
];

registerObjectTickProcessor(ObserverSpy, (spy, context) => {
	spy.room['#removeObject'](spy);
	context.didUpdate();
});
