import type { RoomObject } from '~/engine/game/room-object';
const { create } = Object;

const kCpuCost = 0.2;

export class IntentManager {
	cpu = 0;
	intentsById = create(null);

	save(object: RoomObject, action: string, meta: any) {
		let intents = this.intentsById[object.id];
		if (intents === undefined) {
			intents = this.intentsById[object.id].intents = intents;
		}
		if (intents[action] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[action] = meta;
	}
}

export const gameContext = {
	gameTime: NaN,
	intents: undefined as any as IntentManager,
	userId: undefined as any as string,
};
