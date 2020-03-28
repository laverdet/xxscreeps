import { ConstructionSite, ConstructibleStructureType, Name } from '~/game/objects/construction-site';
import { Owner } from '~/game/objects/room-object';
import { RoomPosition } from '~/game/position';
import { instantiate } from '~/lib/utility';
import * as ExtensionIntent from './extension';
import * as RoomIntent from './room';
import { newRoomObject } from './room-object';

export function build(site: ConstructionSite, energy: number) {
	site.progress += energy;
	if (site.progress >= site.progressTotal) {
		const { pos, room, structureType } = site;
		const level = site.room.controller?.level ?? 0;
		RoomIntent.removeObject(room, site.id);
		if (structureType === 'extension') {
			RoomIntent.insertObject(room, ExtensionIntent.create(pos, level, site[Owner]));
		}
	}
}

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
		[Name]: name ?? '',
		[Owner]: owner,
	});
}
