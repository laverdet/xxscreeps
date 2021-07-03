import * as C from 'xxscreeps/game/constants';
import * as Creep from 'xxscreeps/mods/creep/creep';
import * as Fn from 'xxscreeps/utility/functional';
import { Game } from 'xxscreeps/game';
import { RoomPosition } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { activateNPC, registerNPC } from 'xxscreeps/mods/npc/processor';
import { registerIntentProcessor, registerRoomTickProcessor } from 'xxscreeps/engine/processor';
import { loop } from './loop';

// Register invader NPC
registerNPC('2', loop);

// Register invader generator
registerRoomTickProcessor(room => {
	const target = room['#invaderEnergyTarget'] || C.INVADERS_ENERGY_GOAL;
	const totalEnergy = room['#cumulativeEnergyHarvested'];
	const energy = totalEnergy - room['#invaderEnergyTarget'];
	if (energy > target) {
		// Reset energy goal for next invasion
		let invaderGoal = Math.floor(C.INVADERS_ENERGY_GOAL * (Math.random() * 0.6 + 0.7));
		if (Math.random() < 0.1) {
			invaderGoal *= Math.floor(Math.random() > 0.5 ? 2 : 0.5);
		}
		room['#invaderEnergyTarget'] = totalEnergy + invaderGoal;

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
			room['#insertObject'](create(pos, role, 'small', Game.time + C.CREEP_LIFE_TIME));
		}
	}
});

// Add backend-only Invader request
declare module 'xxscreeps/engine/processor' {
	interface Intent { invader: typeof intent }
}
const intent = registerIntentProcessor(Room, 'requestInvader', { internal: true }, (room, context, xx: number, yy: number, role: Role, strength: Strength) => {
	const pos = new RoomPosition(xx, yy, room.name);
	room['#insertObject'](create(pos, role, strength, Game.time + 200));
	activateNPC(room, '2');
	context.setActive();
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
	creep['#ageTime'] = ageTime;
	return creep;
}

function createBody(parts: { [Type in Creep.PartType]?: number }) {
	const size = Fn.accumulate(Object.values(parts));
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
