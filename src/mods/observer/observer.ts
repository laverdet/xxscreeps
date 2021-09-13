import { Game, intents } from 'xxscreeps/game';
import { chainIntentChecks } from 'xxscreeps/game/checks';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import type { RoomPosition } from 'xxscreeps/game/position';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { OwnedStructure, checkMyStructure, checkPlacement, ownedStructureFormat } from 'xxscreeps/mods/structure/structure';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';

export const format = () => compose(shape, StructureObserver);
const shape = declare('Observer', struct(ownedStructureFormat, {
	...variant('observer'),
	hits: 'int32',
	'#actionLog': RoomObject.actionLogFormat,
}));

export class StructureObserver extends withOverlay(OwnedStructure, shape) {
	override get hitsMax() { return C.OBSERVER_HITS }
	override get structureType() { return C.STRUCTURE_OBSERVER }

	observeRoom(roomName: string) {
		return chainIntentChecks(
			() => checkMyStructure(this, StructureObserver),
			() => checkObserve(this, roomName),
			() => intents.save(this, 'observeRoom', roomName));
	}
}

export function create(pos: RoomPosition, owner: string) {
	const observer = assign(RoomObject.create(new StructureObserver, pos), {
		hits: C.OBSERVER_HITS,
	});
	observer['#user'] = owner;
	return observer;
}

// `ConstructionSite` registration
registerBuildableStructure(C.STRUCTURE_OBSERVER, {
	obstacle: true,
	checkPlacement(room, pos) {
		return checkPlacement(room, pos) === C.OK ?
			C.CONSTRUCTION_COST.observer : null;
	},
	create(site) {
		return create(site.pos, site['#user']);
	},
});

//
// Intent checks
function checkObserve(observer: StructureObserver, target: string) {
	if (observer.room.controller!.level < 8) return C.ERR_RCL_NOT_ENOUGH;
	const range = Game.map.getRoomLinearDistance(observer.room.name, target);
	if (!(range < Infinity) || range === 0) {
		return C.ERR_INVALID_ARGS;
	} else if (range > C.OBSERVER_RANGE) {
		return C.ERR_NOT_IN_RANGE;
	}
	return C.OK;
}
