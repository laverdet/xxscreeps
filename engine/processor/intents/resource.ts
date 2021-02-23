import { bindProcessor } from 'xxscreeps/engine/processor/bind';
import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import type { RoomPosition } from 'xxscreeps/game/position';
import * as Room from 'xxscreeps/game/room/room';
import { instantiate } from 'xxscreeps/util/utility';
import { Resource, ResourceType } from 'xxscreeps/game/objects/resource';
import type { StructureContainer } from 'xxscreeps/game/objects/structures/container';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

function create(pos: RoomPosition, resourceType: ResourceType, amount: number) {
	return instantiate(Resource, {
		...newRoomObject(pos),
		amount,
		resourceType,
	});
}

export function drop(pos: RoomPosition, resourceType: ResourceType, amount: number) {
	const room = Game.rooms[pos.roomName]!;
	let remaining = amount;

	// Is there a container to catch the resource?
	const containers = room.lookForAt(C.LOOK_STRUCTURES, pos).filter(
		(look): look is Room.LookForType<StructureContainer> => look.structure.structureType === 'container');
	for (const { structure } of containers) {
		const capacity = structure.store.getFreeCapacity(resourceType);
		if (capacity > 0) {
			const amount = Math.min(remaining, capacity);
			remaining -= amount;
			StoreIntent.add(structure.store, resourceType, amount);
			if (remaining === 0) {
				return;
			}
		}
	}

	// Is there already resource on the ground?
	const resources = room.lookForAt(C.LOOK_RESOURCES, pos);
	for (const { resource } of resources) {
		if (resource.resourceType === resourceType) {
			resource.amount += remaining;
			return;
		}
	}

	// Create new dropped resource here
	const resource = create(pos, resourceType, remaining);
	Room.insertObject(room, resource);
}

export default () => bindProcessor(Resource, {
	tick() {
		this.amount -= Math.ceil(this.amount / C.ENERGY_DECAY);
		if (this.amount <= 0) {
			Room.removeObject(this);
		}
		return true;
	},
});
