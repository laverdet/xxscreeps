import type { Dictionary } from 'xxscreeps/util/types';
import * as C from 'xxscreeps/game/constants';
import { Room } from 'xxscreeps/game/room';
import type { Intents as CreepIntents } from 'xxscreeps/engine/processor/intents/creep';
import type { Intents as FlagIntents } from 'xxscreeps/engine/runner/flag';
import type { Intents as RoomIntents } from 'xxscreeps/engine/processor/intents/room';
import type { Intents as SpawnIntents } from 'xxscreeps/engine/processor/intents/spawn';

const kCpuCost = 0.2;

type AnyIntents = CreepIntents | FlagIntents | RoomIntents | SpawnIntents;
type AnyReceiver = AnyIntents['receiver'];

export class IntentManager {
	cpu = 0;
	intentsByGroup: Dictionary<Record<string, any>> = Object.create(null);

	getIntentsForReceiver(object: AnyReceiver) {
		const { group, id } = function() {
			if (object === 'flags') {
				return { group: 'flags', id: 'flags' };
			} else if (object instanceof Room) {
				return { group: object.name, id: object.name };
			} else {
				return { group: object.pos.roomName, id: object.id };
			}
		}();
		const intentsForRoom = this.intentsByGroup[group] ?? (this.intentsByGroup[group] = Object.create(null));
		return intentsForRoom[id] ?? (intentsForRoom[id] = Object.create(null));
	}

	push<Intent extends keyof FlagIntents['parameters']>(
		receiver: FlagIntents['receiver'], intent: Intent, parameters: FlagIntents['parameters'][Intent][number]): typeof C.OK;
	push<Intent extends keyof RoomIntents['parameters']>(
		receiver: RoomIntents['receiver'], intent: Intent, parameters: RoomIntents['parameters'][Intent][number]): typeof C.OK;
	push(receiver: AnyReceiver, intent: string, parameters: any) {
		const intents = this.getIntentsForReceiver(receiver);
		const list = intents[intent] ?? (intents[intent] = []);
		list.push(parameters);
		this.cpu += kCpuCost;
		return C.OK;
	}

/*
	save<Intent extends keyof CreepIntents['parameters']>(
		receiver: CreepIntents['receiver'], intent: Intent, parameters: CreepIntents['parameters'][Intent]): typeof C.OK;
	save<Intent extends keyof SpawnIntents['parameters']>(
		receiver: SpawnIntents['receiver'], intent: Intent, parameters: SpawnIntents['parameters'][Intent]): typeof C.OK;*/
	save(receiver: AnyReceiver, intent: string, parameters: any) {
		const intents = this.getIntentsForReceiver(receiver);
		if (intents[intent] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[intent] = parameters;
		return C.OK;
	}
}
