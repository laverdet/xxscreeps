import type { RoomObject } from '~/engine/game/objects/room-object';
const { create } = Object;

const kCpuCost = 0.2;

export class IntentManager {
	cpu = 0;
	intentsById = create(null);

	save<Type extends RoomObject>(object: Type, action: string, meta: any) {
		let intents = this.intentsById[object.id];
		if (intents === undefined) {
			intents = this.intentsById[object.id] = Object.create(null);
		}
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
