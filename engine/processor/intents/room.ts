import * as C from '~/game/constants';
import { me } from '~/game/game';
import { ConstructibleStructureType } from '~/game/objects/construction-site';
import { RoomPosition } from '~/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import { AnyRoomObject, Room, checkCreateConstructionSite } from '~/game/room';
import * as ConstructionIntents from './construction-site';

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
	room._objects.push(object);
	(function(this: Room) {
		this._wasInserted(object);
	}).apply(room);
}

export function removeObject(room: Room, object: AnyRoomObject) {
	(function() {
		for (let ii = 0; ii < room._objects.length; ++ii) {
			if (room._objects[ii].id === object.id) {
				room._objects.splice(ii, 1);
				return;
			}
		}
		throw new Error('Removed object was not found');
	})();
	(function(this: Room) {
		this._wasRemoved(object);
	}).apply(room);
}

export default () => bindProcessor(Room, {
	process(intent: Partial<Parameters>) {
		if (intent.createConstructionSite) {
			const params = intent.createConstructionSite;
			const pos = new RoomPosition(params.xx, params.yy, this.name);
			if (checkCreateConstructionSite(this, pos, params.structureType) === C.OK) {
				const site = ConstructionIntents.create(pos, params.structureType, params.name, me);
				insertObject(this, site);
			}
		}
		return false;
	},
});
