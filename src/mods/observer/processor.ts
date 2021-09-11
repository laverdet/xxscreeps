import { registerIntentProcessor } from 'xxscreeps/engine/processor';
import { StructureObserver } from 'xxscreeps/mods/observer/observer';

declare module 'xxscreeps/engine/processor' {
	interface Intent {observer: typeof intents}
}

const intents = [
	registerIntentProcessor(StructureObserver, 'observeRoom', {}, (observer, context, target: string) => {
		// TODO: make the user see the target room next tick
		console.log('OBSERVER', observer.room.name, '->', target);
	}),
];
