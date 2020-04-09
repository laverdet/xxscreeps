import * as C from '~/game/constants';
import * as Game from '~/game/game';
import type { RoomPosition } from '~/game/position';
import { instantiate } from '~/lib/utility';
import { StructureContainer } from '~/game/objects/structures/container';
import { bindProcessor } from '../bind';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

export function create(pos: RoomPosition) {
	const ownedController = Game.rooms[pos.roomName]!.controller?.owner;
	return instantiate(StructureContainer, {
		...newRoomObject(pos),
		hits: C.EXTENSION_HITS,
		store: StoreIntent.create(C.CONTAINER_CAPACITY),
		_nextDecayTime: Game.time + (ownedController ?
			C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME),
		_owner: undefined,
	});
}

export default () => bindProcessor(StructureContainer, {
	tick() {
		if (this.ticksToDecay === 0) {
			const ownedController = Game.rooms[this.pos.roomName]!.controller?.owner;
			this.hits -= C.CONTAINER_DECAY;
			this._nextDecayTime = Game.time + (ownedController ?
				C.CONTAINER_DECAY_TIME_OWNED : C.CONTAINER_DECAY_TIME);
		}
		return true;
	},
});
