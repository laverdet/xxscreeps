import type { Dictionary } from 'xxscreeps/util/types';
import { Room } from 'xxscreeps/game/room';
import * as Game from 'xxscreeps/game/game';
// eslint-disable-next-line no-duplicate-imports
import { runAsUser, runWithTime } from 'xxscreeps/game/game';
import * as Movement from './intents/movement';
import { Processors, Tick } from 'xxscreeps/processor/symbols';

type RoomIntentsFromRunner = {
	room?: Dictionary<any[]>;
	objects?: Dictionary<Dictionary<any>>;
};

export class ProcessorContext {
	constructor(
		public time: number,
		public room: Room,
	) {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	processIntents(user: string, intents: RoomIntentsFromRunner) {
		runAsUser(user, this.time, () => {

			// Process intents for room (createConstructionSite)
			const roomIntents = intents.room;
			const processors = this.room[Processors];
			if (roomIntents && processors) {
				for (const intent in roomIntents) {
					const processor = processors[intent];
					if (processor) {
						for (const args of roomIntents[intent]!) {
							processor(this.room, ...args);
						}
					}
				}
			}

			// Process intents for room objects
			const objectIntents = intents.objects;
			if (objectIntents) {
				for (const id in objectIntents) {
					const object = Game.getObjectById(id);
					if (object) {
						for (const [ intent, args ] of Object.entries(objectIntents[id]!)) {
							object[Processors]![intent]?.(object, ...args);
						}
					}
				}
			}
		});
	}

	processTick() {
		// Run per-tick processor for all objects
		runWithTime(this.time, () => {
			Movement.dispatch(this.room);
			for (const object of this.room._objects) {
				object[Tick]?.(object);
			}
		});
	}
}
