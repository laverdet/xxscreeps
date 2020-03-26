import { gameContext } from '~/game/context';
import { Room, Objects } from '~/game/room';
import { Process, Tick } from './bind';

export class ProcessorContext {
	constructor(
		public time: number,
		public room: Room,
	) {}

	intents(user: string, intentsById: Dictionary<Dictionary<object>>) {
		gameContext.createdCreepNames = new Set;
		gameContext.userId = user;
		for (const object of this.room[Objects]) {
			const intents = intentsById[object.id];
			if (intents !== undefined) {
				object[Process]?.call(object, intents, this);
			}
		}
	}

	tick() {
		for (const object of this.room[Objects]) {
			object[Tick]?.call(object, this);
		}
	}
}
