import * as C from '~/game/constants';
import { RoomObject } from '~/game/objects/room-object';
import { Room } from '~/game/room';
import type { Intents as CreepIntents } from '~/engine/processor/intents/creep';
import type { Intents as RoomIntents } from '~/engine/processor/intents/room';
import type { Intents as SpawnIntents } from '~/engine/processor/intents/spawn';

const kCpuCost = 0.2;

export class IntentManager {
	cpu = 0;
	intentsByRoom: Dictionary<Record<string, any>> = Object.create(null);

	getIntentsForReceiver(object: RoomObject | Room) {
		const { room, id } = function() {
			if (object instanceof Room) {
				return { room: object.name, id: object.name };
			} else {
				return { room: object.pos.roomName, id: object.id };
			}
		}();
		const intentsForRoom = this.intentsByRoom[room] ?? (this.intentsByRoom[room] = Object.create(null));
		return intentsForRoom[id] ?? (intentsForRoom[id] = Object.create(null))
	}

	push<Intent extends keyof RoomIntents['parameters']>(
		receiver: RoomIntents['receiver'], intent: Intent, parameters: RoomIntents['parameters'][Intent][number]): typeof C.OK;
	push(object: Room, action: string, parameters: any) {
		const intents = this.getIntentsForReceiver(object);
		const list = intents[action] ?? (intents[action] = []);
		list.push(parameters);
		this.cpu += kCpuCost;
		return C.OK;
	}

	save<Intent extends keyof CreepIntents['parameters']>(
		receiver: CreepIntents['receiver'], intent: Intent, parameters: CreepIntents['parameters'][Intent]): typeof C.OK;
	save<Intent extends keyof SpawnIntents['parameters']>(
		receiver: SpawnIntents['receiver'], intent: Intent, parameters: SpawnIntents['parameters'][Intent]): typeof C.OK;
	save(object: RoomObject | Room, action: string, parameters: any) {
		const intents = this.getIntentsForReceiver(object);
		if (intents[action] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[action] = parameters;
		return C.OK;
	}
}
