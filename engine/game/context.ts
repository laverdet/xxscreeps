import type { RoomObject } from '~/engine/game/objects/room-object';
const { create } = Object;

const kCpuCost = 0.2;

export class IntentManager {
	cpu = 0;
	intentsByRoom = create(null);

	save<Type extends RoomObject>(object: Type, action: string, meta: any) {
		const { id } = object;
		const { roomName } = object.pos;
		const intentsForRoom = this.intentsByRoom[roomName] ?? (this.intentsByRoom[roomName] = create(null));
		const intents = intentsForRoom[id] ?? (intentsForRoom[id] = create(null));
		if (intents[action] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[action] = meta;
	}
}

type GameContext = {
	createdCreepNames: Set<string>;
	intents: IntentManager;
	userId: string;
};

export const gameContext: GameContext = {} as any;
