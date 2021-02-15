import * as C from 'xxscreeps/game/constants';
import { me } from 'xxscreeps/game/game';
import { ConstructibleStructureType } from 'xxscreeps/game/objects/construction-site';
import { RoomPosition } from 'xxscreeps/game/position';
import { bindProcessor } from 'xxscreeps/engine/processor/bind';
import { Room, checkCreateConstructionSite, insertObject } from 'xxscreeps/game/room';
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
