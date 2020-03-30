import { gameContext } from '~/game/context';
import { ConstructibleStructureType } from '~/game/objects/construction-site';
import { RoomPosition } from '~/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import { AnyRoomObject, Objects, Room } from '~/game/room';
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

export function insertObject(room: Room, object: AnyRoomObject) {
	object.room = room;
	room[Objects].push(object);
}

export function removeObject(room: Room, id: string) {
	for (let ii = 0; ii < room[Objects].length; ++ii) {
		if (room[Objects][ii].id === id) {
			room[Objects].splice(ii, 1);
		}
	}
}

export default () => bindProcessor(Room, {
	process(intent: Partial<Parameters>) {
		if (intent.createConstructionSite) {
			const params = intent.createConstructionSite;
			const pos = new RoomPosition(params.xx, params.yy, this.name);
			const site = createConstructionSite(pos, params.structureType, params.name, gameContext.userId);
			insertObject(this, site);
			return true;
		}
		return false;
	},
});
