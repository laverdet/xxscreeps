import * as C from '~/game/constants';
import type { RoomObject } from '~/game/objects/room-object';
import type * as Creep from '~/engine/processor/intents/creep';
import type * as Spawn from '~/engine/processor/intents/spawn';
const { create } = Object;

const kCpuCost = 0.2;

export class IntentManager {
	cpu = 0;
	intentsByRoom = create(null);

	save<Intent extends keyof Creep.Intents['parameters']>(
		receiver: Creep.Intents['receiver'], intent: Intent, parameters: Creep.Intents['parameters'][Intent]): typeof C.OK;
	save<Intent extends keyof Spawn.Intents['parameters']>(
		receiver: Spawn.Intents['receiver'], intent: Intent, parameters: Spawn.Intents['parameters'][Intent]): typeof C.OK;
	save<Type extends RoomObject>(object: Type, action: string, meta: any) {
		const { id } = object;
		const { roomName } = object.pos;
		const intentsForRoom = this.intentsByRoom[roomName] ?? (this.intentsByRoom[roomName] = create(null));
		const intents = intentsForRoom[id] ?? (intentsForRoom[id] = create(null));
		if (intents[action] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[action] = meta;
		return C.OK;
	}
}

type GameContext = {
	createdCreepNames: Set<string>;
	intents: IntentManager;
	userId: string;
};

export const gameContext: GameContext = {} as any;
