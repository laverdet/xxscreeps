import type { Room } from 'xxscreeps/game/room/room';
import { CumulativeEnergyHarvested } from './symbols';

export function readCumulativeEnergyHarvested(room: Room) {
	return room[CumulativeEnergyHarvested];
}
