import type { Manifest } from 'xxscreeps/config/mods';
import type { Room } from 'xxscreeps/game/room/room';
import { CumulativeEnergyHarvested } from './symbols';

export function readCumulativeEnergyHarvested(room: Room) {
	return room[CumulativeEnergyHarvested];
}

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/creep',
		'xxscreeps/mods/harvestable',
		'xxscreeps/mods/resource',
	],
};
