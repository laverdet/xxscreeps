import type { Dictionary } from 'xxscreeps/util/types';
import { Room } from 'xxscreeps/game/room';
import { runAsUser, runWithTime } from 'xxscreeps/game/game';
import * as Movement from './intents/movement';
//import { Process, Tick } from './bind';

export class ProcessorContext {
	constructor(
		public time: number,
		public room: Room,
	) {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	processIntents(user: string, intentsById: Dictionary<Dictionary<object>>) {
		runAsUser(user, this.time, () => {
/*
			const roomIntents = intentsById[this.room.name];
			if (roomIntents) {
				this.room[Process]!(roomIntents, this);
			}

			for (const object of this.room._objects) {
				const intents = intentsById[object.id];
				if (intents !== undefined) {
					// object[Process]?.call(object, intents, this);
				}
			}*/
		});
	}

	processTick() {
		runWithTime(this.time, () => {
			Movement.dispatch(this.room);
/* for (const object of this.room._objects) {
				object[Tick]?.call(object, this);
			}*/
		});
	}
}
