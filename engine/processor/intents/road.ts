import * as C from '~/game/constants';
import * as Game from '~/game/game';
import * as Map from '~/game/map';
import type { RoomPosition } from '~/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import { instantiate } from '~/lib/utility';
import { newRoomObject } from './room-object';
import { StructureRoad } from '~/game/objects/structures/road';

export function create(pos: RoomPosition) {
	return instantiate(StructureRoad, {
		...newRoomObject(pos),
		hits: C.ROAD_HITS,
		nextDecayTime: Game.time + C.ROAD_DECAY_TIME,
		_owner: undefined,
	});
}

export default () => bindProcessor(StructureRoad, {
	tick() {
		if (this.ticksToDecay === 0) {
			const { pos } = this;
			const terrain = Map.getTerrainForRoom(pos.roomName).get(pos.x, pos.y);
			const decayMultiplier =
				terrain === C.TERRAIN_MASK_WALL ? C.CONSTRUCTION_COST_ROAD_WALL_RATIO :
				terrain === C.TERRAIN_MASK_SWAMP ? C.CONSTRUCTION_COST_ROAD_SWAMP_RATIO :
				1;
			this.hits -= C.ROAD_DECAY_AMOUNT * decayMultiplier;
			this.nextDecayTime = Game.time + C.ROAD_DECAY_TIME;
		}
		return true;
	},
});
