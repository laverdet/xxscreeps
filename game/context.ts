import * as C from '~/game/constants';
import { RoomObject } from '~/game/objects/room-object';
import { Room } from '~/game/room';
import type { Intents as CreepIntents } from '~/engine/processor/intents/creep';
import type { Intents as RoomIntents } from '~/engine/processor/intents/room';
import type { Intents as SpawnIntents } from '~/engine/processor/intents/spawn';
const { create } = Object;

const kCpuCost = 0.2;

export class IntentManager {
	cpu = 0;
	intentsByRoom = create(null);

	getIntentsForRoomAndId(room: string, id: string) {
		const intentsForRoom = this.intentsByRoom[room] ?? (this.intentsByRoom[room] = create(null));
		return intentsForRoom[id] ?? (intentsForRoom[id] = create(null));
	}

	save<Intent extends keyof CreepIntents['parameters']>(
		receiver: CreepIntents['receiver'], intent: Intent, parameters: CreepIntents['parameters'][Intent]): typeof C.OK;
	save<Intent extends keyof RoomIntents['parameters']>(
		receiver: RoomIntents['receiver'], intent: Intent, parameters: RoomIntents['parameters'][Intent]): typeof C.OK;
	save<Intent extends keyof SpawnIntents['parameters']>(
		receiver: SpawnIntents['receiver'], intent: Intent, parameters: SpawnIntents['parameters'][Intent]): typeof C.OK;
	save(object: RoomObject | Room, action: string, meta: any) {
		const intents = (() => {
			if (object instanceof Room) {
				return this.getIntentsForRoomAndId(object.name, object.name);
			} else if (object instanceof RoomObject) {
				return this.getIntentsForRoomAndId(object.pos.roomName, object.id);
			} else {
				throw new Error('Invalid object');
			}
		})();
		if (intents[action] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[action] = meta;
		return C.OK;
	}
}

type GameContext = {
	intents: IntentManager;
	userId: string;
};

export const gameContext: GameContext = {} as any;
