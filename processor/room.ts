import type { Dictionary } from 'xxscreeps/util/types';
import type { Room } from 'xxscreeps/game/room';
import * as Game from 'xxscreeps/game/game';
import * as Movement from 'xxscreeps/engine/processor/intents/movement';
import { EventLogSymbol } from 'xxscreeps/game/room/event-log';
import { Processors, RoomTickProcessor, Tick, roomTickProcessors } from './symbols';

import 'xxscreeps/config/mods/processor';
import 'xxscreeps/engine/processor/intents';

// Register per-tick per-room processor
export function registerRoomTickProcessor(tick: RoomTickProcessor) {
	roomTickProcessors.push(tick);
}

// Intent payload from runner
type IntentPayload = {
	room?: Dictionary<any[]>;
	objects?: Dictionary<Dictionary<any>>;
};
type UserIntentPayload = {
	user: string;
	intents: IntentPayload;
};

// Room processor context saved been phase 1 (process) and phase 2 (flush)
export class RoomProcessorContext {
	constructor(
		public readonly room: Room,
		public readonly time: number,
		private readonly intents: UserIntentPayload[] = [],
	) {}

	process() {
		Game.runWithState([ this.room ], this.time, () => {
			// Reset eventLog for this tick
			this.room[EventLogSymbol] = [];

			// Run `registerRoomTickProcessor` hooks
			for (const process of roomTickProcessors) {
				process(this.room, this);
			}

			// Process user intents
			for (const { user, intents } of this.intents) {
				Game.runAsUser(user, () => {

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

			// Post-intent processor
			Movement.dispatch(this.room);
			for (const object of this.room._objects) {
				object[Tick]?.(object);
			}
		});
	}

	saveIntents(user: string, intents: IntentPayload) {
		this.intents.push({ user, intents });
	}
}
