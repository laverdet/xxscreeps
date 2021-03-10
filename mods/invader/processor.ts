import * as C from 'xxscreeps/game/constants';
import * as Creep from 'xxscreeps/game/objects/creep';
import * as Fn from 'xxscreeps/utility/functional';
import * as Game from 'xxscreeps/game/game';
import { RoomPosition } from 'xxscreeps/game/position';
import { insertObject } from 'xxscreeps/game/room/methods';
import { activateNPC, registerNPC } from 'xxscreeps/mods/npc/processor';
import { registerRoomTickProcessor } from 'xxscreeps/processor';
import { readCumulativeEnergyHarvested } from 'xxscreeps/mods/source';
import { InvaderEnergyTarget } from './game';
import { loop } from './loop';

// Register invader NPC
registerNPC('2', loop);

// Register invader generator
registerRoomTickProcessor(room => {
	const target = room[InvaderEnergyTarget] || C.INVADERS_ENERGY_GOAL;
	const totalEnergy = readCumulativeEnergyHarvested(room);
	const energy = totalEnergy - room[InvaderEnergyTarget];
	if (energy > target) {
		// Reset energy goal for next invasion
		let invaderGoal = Math.floor(C.INVADERS_ENERGY_GOAL * (Math.random() * 0.6 + 0.7));
		if (Math.random() < 0.1) {
			invaderGoal *= Math.floor(Math.random() > 0.5 ? 2 : 0.5);
		}
		room[InvaderEnergyTarget] = totalEnergy + invaderGoal;

		// Find raid origin
		const exits = room.find(C.FIND_EXIT);
		const origin = exits[Math.floor(exits.length * Math.random())];
		exits.sort((a, b) => origin.getRangeTo(a) - origin.getRangeTo(b));

		// Send the boys
		activateNPC(room, '2');
		for (let ii = 0; ii < 3; ++ii) {
			const role = ([ 'melee', 'healer', 'ranged' ] as Role[])[ii % 3];
			if (ii >= exits.length) {
				break;
			}
			const pos = exits[ii];
			insertObject(room, create(pos, role, 'small', Game.time + C.CREEP_LIFE_TIME));
		}
	}
});

// Creep factory for invaders
type Strength = 'big' | 'small';
type Role = 'healer' | 'melee' | 'ranged';

const bodies = {
	bighealer: () => createBody({ [C.HEAL]: 25 }),
	bigranged: () => createBody({ [C.TOUGH]: 6, [C.RANGED_ATTACK]: 18, [C.WORK]: 1 }),
	bigmelee: () => createBody({ [C.TOUGH]: 16, [C.RANGED_ATTACK]: 3, [C.WORK]: 4, [C.ATTACK]: 2 }),
	smallhealer: () => createBody({ [C.HEAL]: 5 }),
	smallranged: () => createBody({ [C.TOUGH]: 2, [C.RANGED_ATTACK]: 3 }),
	smallmelee: () => createBody({ [C.TOUGH]: 2, [C.RANGED_ATTACK]: 1, [C.WORK]: 1, [C.ATTACK]: 1 }),
};

export function create(pos: RoomPosition, role: Role, strength: Strength, ageTime: number) {
	const body = bodies[`${strength}${role}` as const]();
	const creep = Creep.create(pos, body, `Invader_${pos.roomName}_${Math.floor(Math.random() * 1000)}`, '2');
	creep._ageTime = ageTime;
	return creep;
}

function createBody(parts: { [Type in Creep.PartType]?: number }) {
	const size = Fn.accumulate(Object.values(parts) as number[]);
	return [
		...Array(parts[C.TOUGH] ?? 0).fill(C.TOUGH),
		...Array(size - 1).fill(C.MOVE),
		...Object.entries(parts).map(([ type, count ]) => {
			if (type === C.TOUGH) {
				return [];
			} else {
				return Array(count).fill(type);
			}
		}).flat(),
		C.MOVE,
	];
}
