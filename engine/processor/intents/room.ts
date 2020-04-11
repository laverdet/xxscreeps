import * as C from '~/game/constants';
import { me } from '~/game/game';
import { ConstructibleStructureType } from '~/game/objects/construction-site';
import { RoomPosition } from '~/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import { Room, checkCreateConstructionSite, insertObject } from '~/game/room';
import * as ConstructionIntent from './construction-site';

type Parameters = {
	createConstructionSite: {
		name?: string;
		structureType: ConstructibleStructureType;
		xx: number;
		yy: number;
	}[];
};

export type Intents = {
	receiver: Room;
	parameters: Parameters;
};

export default () => bindProcessor(Room, {
	process(intent: Partial<Parameters>) {
		if (intent.createConstructionSite) {
			for (const params of intent.createConstructionSite) {
				const pos = new RoomPosition(params.xx, params.yy, this.name);
				if (checkCreateConstructionSite(this, pos, params.structureType) === C.OK) {
					const site = ConstructionIntent.create(pos, params.structureType, params.name, me);
					insertObject(this, site);
				}
			}
		}
		return false;
	},
});
