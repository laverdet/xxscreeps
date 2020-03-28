import { ConstructionSite, ConstructibleStructureType, Name } from '~/game/objects/construction-site';
import { Owner } from '~/game/objects/room-object';
import { RoomPosition } from '~/game/position';
import { generateId } from '~/engine/util/id';
import { instantiate } from '~/lib/utility';

export function create(
	pos: RoomPosition,
	structureType: ConstructibleStructureType,
	name: string | undefined,
	owner: string,
) {
	return instantiate(ConstructionSite, {
		id: generateId(),
		pos,
		effects: undefined,
		progress: 0,
		structureType,
		[Name]: name ?? '',
		[Owner]: owner,
	});
}
