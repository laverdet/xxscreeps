import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import * as Map from 'xxscreeps/game/map';
import type { RoomPosition } from 'xxscreeps/game/position';
import { bindProcessor } from 'xxscreeps/engine/processor/bind';
import { instantiate } from 'xxscreeps/util/utility';
import { newRoomObject } from './room-object';
import { StructureRoad } from 'xxscreeps/game/objects/structures/road';

export function create(pos: RoomPosition) {
	return instantiate(StructureRoad, {
		...newRoomObject(pos),
		hits: C.ROAD_HITS,
		_nextDecayTime: Game.time + C.ROAD_DECAY_TIME,
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
			this._nextDecayTime = Game.time + C.ROAD_DECAY_TIME;
		}
		return true;
	},
});
