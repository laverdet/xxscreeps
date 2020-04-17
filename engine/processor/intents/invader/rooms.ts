import * as C from '~/game/constants';
import * as Game from '~/game/game';
import { CostMatrix } from '~/game/path-finder';

let cached: undefined | {
	costMatrix: CostMatrix;
	roomName: string;
	time: number;
};

export function getCostMatrix(roomName: string) {
	if (cached?.time === Game.time && cached.roomName === roomName) {
		return cached.costMatrix;
	}
	const cm = new CostMatrix;
	cached = {
		costMatrix: cm,
		roomName,
		time: Game.time,
	};
	const room = Game.rooms[roomName]!;
	room.find(C.FIND_CREEPS).forEach(creep => cm.set(creep.pos.x, creep.pos.y, 0xff));
	for (const structure of room.find(C.FIND_STRUCTURES)) {
		if (
			structure.structureType !== C.STRUCTURE_ROAD &&
			structure.structureType !== C.STRUCTURE_CONTAINER
		) {
			cm.set(structure.pos.x, structure.pos.y, 0xff);
		}
	}
	return cm;
}
