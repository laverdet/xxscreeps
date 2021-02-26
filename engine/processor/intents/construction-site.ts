import { registerTickProcessor } from 'xxscreeps/processor';
import { ConstructionSite, ConstructibleStructureType } from 'xxscreeps/game/objects/construction-site';
import { RoomPosition } from 'xxscreeps/game/position';
import * as Room from 'xxscreeps/game/room';
import { instantiate } from 'xxscreeps/util/utility';
import * as ContainerIntent from './container';
import * as ExtensionIntent from './extension';
import * as RoadIntent from './road';
import * as StorageIntent from './storage';
import * as TowerIntent from './tower';
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

registerTickProcessor(ConstructionSite, site => {
	if (site.progress >= site.progressTotal) {
		const { pos, room, structureType, _owner } = site;
		const level = site.room.controller?.level ?? 0;
		Room.removeObject(site);
		const structure = function() {
			switch (structureType) {
				case 'container': return ContainerIntent.create(pos);
				case 'extension': return ExtensionIntent.create(pos, level, _owner);
				case 'road': return RoadIntent.create(pos);
				case 'storage': return StorageIntent.create(pos, _owner);
				case 'tower': return TowerIntent.create(pos, _owner);
				default:
			}
		}();
		if (structure) {
			Room.insertObject(room, structure);
		}
	}
});
