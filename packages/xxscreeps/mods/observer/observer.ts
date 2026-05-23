import type { RoomPosition } from 'xxscreeps/game/position.js';
import { chainIntentChecks } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, intents } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerBuildableStructure } from 'xxscreeps/mods/construction/index.js';
import { OwnedStructure, checkIsActive, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

export const format = () => compose(shape, StructureObserver);
const shape = declare('Observer', struct(ownedStructureFormat, {
	...variant('observer'),
	hits: 'int32',
}));

export class StructureObserver extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.OBSERVER_HITS; }
	override get structureType() { return C.STRUCTURE_OBSERVER; }

	observeRoom(roomName: string) {
		return chainIntentChecks(
			() => checkObserveRoom(this, roomName),
			() => intents.save(this, 'observeRoom', roomName));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const observer = assign(RoomObject.create(new StructureObserver(), pos), {
		hits: C.OBSERVER_HITS,
	});
	observer['#user'] = owner;
	return observer;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_OBSERVER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK
			? C.CONSTRUCTION_COST.observer : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

//
// Intent checks
function checkObserveRoomName(target: string) {
	return Game.map.hasRoom(target) ? C.OK : C.ERR_INVALID_ARGS;
}

function checkObserveRoomRange(observer: StructureObserver, target: string) {
	if (Game.map.getRoomLinearDistance(observer.room.name, target) > C.OBSERVER_RANGE) {
		return C.ERR_NOT_IN_RANGE;
	}
	return C.OK;
}

export function checkObserveRoom(observer: StructureObserver, target: string) {
	return chainIntentChecks(
		() => checkMyStructure(observer, StructureObserver),
		() => checkObserveRoomName(target),
		() => checkIsActive(observer),
		() => checkObserveRoomRange(observer, target),
	);
}
