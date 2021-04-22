import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Store from './store';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { insertObject, removeObject } from 'xxscreeps/game/room/methods';
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
	insertObject(room, resource);
}

registerObjectTickProcessor(Resource, (resource, context) => {
	resource.amount -= Math.ceil(resource.amount / C.ENERGY_DECAY);
	if (resource.amount <= 0) {
		removeObject(resource);
	}
	context.setActive();
});
