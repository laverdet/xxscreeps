import { bindProcessor } from '~/engine/processor/bind';
import { ConstructionSite, ConstructibleStructureType } from '~/game/objects/construction-site';
import { RoomPosition } from '~/game/position';
import { instantiate } from '~/lib/utility';
import * as ContainerIntent from './container';
import * as ExtensionIntent from './extension';
import * as RoadIntent from './road';
import * as RoomIntent from './room';
import { newRoomObject } from './room-object';

export function create(
	pos: RoomPosition,
	structureType: ConstructibleStructureType,
	name: string | undefined,
	owner: string,
) {
	return instantiate(ConstructionSite, {
		...newRoomObject(pos),
		effects: undefined,
		progress: 0,
		structureType,
		name: name ?? '',
		_owner: owner,
	});
}

export default () => bindProcessor(ConstructionSite, {
	tick() {
		if (this.progress >= this.progressTotal) {
			const { pos, room, structureType, _owner } = this;
			const level = this.room.controller?.level ?? 0;
			RoomIntent.removeObject(room, this);
			const structure = function() {
				switch (structureType) {
					case 'container': return ContainerIntent.create(pos);
					case 'extension': return ExtensionIntent.create(pos, level, _owner);
					case 'road': return RoadIntent.create(pos);
					default:
				}
			}();
			if (structure) {
				RoomIntent.insertObject(room, structure);
			}
		}
		return true;
	},
});
