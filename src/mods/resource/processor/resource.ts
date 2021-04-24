import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Store from './store';
import { Game } from 'xxscreeps/game';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { InsertObject, RemoveObject } from 'xxscreeps/game/room';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure';
import { Resource, ResourceType, create } from '../resource';

export function drop(pos: RoomPosition, resourceType: ResourceType, amount: number) {
	const room = Game.rooms[pos.roomName]!;
	let remaining = amount;

	// Is there a container to catch the resource?
	const container = lookForStructureAt(room, pos, C.STRUCTURE_CONTAINER);
	if (container) {
		const capacity = container.store.getFreeCapacity(resourceType);
		if (capacity > 0) {
			const amount = Math.min(remaining, capacity);
			remaining -= amount;
			Store.add(container.store, resourceType, amount);
			if (remaining === 0) {
				return;
			}
		}
	}

	// Is there already resource on the ground?
	const resources = room.lookForAt(C.LOOK_RESOURCES, pos);
	for (const resource of resources) {
		if (resource.resourceType === resourceType) {
			resource.amount += remaining;
			return;
		}
	}

	// Create new dropped resource here
	const resource = create(pos, resourceType, remaining);
	room[InsertObject](resource);
}

registerObjectTickProcessor(Resource, (resource, context) => {
	resource.amount -= Math.ceil(resource.amount / C.ENERGY_DECAY);
	if (resource.amount <= 0) {
		resource.room[RemoveObject](resource);
	}
	context.setActive();
});
