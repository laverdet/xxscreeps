import { gameContext } from '~/game/context';
import { ConstructibleStructureType } from '~/game/objects/construction-site';
import { RoomPosition } from '~/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import { Objects, Room } from '~/game/room';
import { create as createConstructionSite } from './construction-site';

type Parameters = {
	createConstructionSite: {
		name?: string;
		structureType: ConstructibleStructureType;
		xx: number;
		yy: number;
	};
};

export type Intents = {
	receiver: Room;
	parameters: Parameters;
};

export default () => bindProcessor(Room, {
	process(intent: Partial<Parameters>) {
		if (intent.createConstructionSite) {
			const params = intent.createConstructionSite;
			const pos = new RoomPosition(params.xx, params.yy, this.name);
			const site = createConstructionSite(pos, params.structureType, params.name, gameContext.userId);
			this[Objects].push(site);
			return true;
		}
		return false;
	},
});
