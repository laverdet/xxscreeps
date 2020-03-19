import { Room, Objects } from '~/engine/game/room';
import { Process } from './bind';

export class ProcessorContext {
	constructor(
		public time: number,
		public room: Room,
	) {}

	process() {
		for (const object of this.room[Objects].values()) {
			object[Process]?.(this);
		}
	}
}
