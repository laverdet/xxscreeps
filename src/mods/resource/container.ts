import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import { Game } from 'xxscreeps/game';
import { Structure, checkWall, structureFormat } from 'xxscreeps/mods/structure/structure';
import { isBorder } from 'xxscreeps/game/position';
import { registerBuildableStructure } from 'xxscreeps/mods/construction';
import { OpenStore, openStoreFormat } from './store';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';

export const format = declare('Container', () => compose(shape, StructureContainer));
const shape = struct(structureFormat, {
	...variant('container'),
	hits: 'int32',
	store: openStoreFormat,
	'#nextDecayTime': 'int32',
});

export class StructureContainer extends withOverlay(Structure, shape) {
	get storeCapacity() { return this.store.getCapacity() }
	override get hitsMax() { return C.CONTAINER_HITS }
	override get structureType() { return C.STRUCTURE_CONTAINER }
	@enumerable get ticksToDecay() { return Math.max(0, this['#nextDecayTime'] - Game.time) }

	override ['#checkObstacle']() {
		return false;
	}
}

export function create(pos: RoomPosition) {
	const ownedController = Game.rooms[pos.roomName]!.controller?.['#user'];
	const container = assign(RoomObject.create(new StructureContainer, pos), {
		hits: C.CONTAINER_HITS,
		store: OpenStore['#create'](C.CONTAINER_CAPACITY),
	});
	container['#nextDecayTime'] = Game.time + (ownedController ?
		C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME) - 1;
	return container;
}

registerBuildableStructure(C.STRUCTURE_CONTAINER, {
	obstacle: false,
	checkPlacement(room, pos) {
		if (isBorder(pos.x, pos.y)) {
			return null;
		}
		return checkWall(pos) === C.OK ?
			C.CONSTRUCTION_COST.container : null;
	},
	create(site) {
		return create(site.pos);
	},
});
