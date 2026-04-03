import { registerIntentProcessor, registerRoomTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import * as Creep from 'xxscreeps/mods/creep/creep.js';
import { activateNPC, registerNPC } from 'xxscreeps/mods/npc/processor.js';
import { loop } from './loop/index.js';

// Register invader NPC
registerNPC('2', loop);

// Register invader generator
registerRoomTickProcessor((room, context) => {
	const target = room['#invaderEnergyTarget'] || C.INVADERS_ENERGY_GOAL;
	const totalEnergy = room['#cumulativeEnergyHarvested'];
	const energy = totalEnergy - room['#invaderEnergyTarget'];
	if (energy > target) {
		// Reset energy goal for next invasion
		let invaderGoal = Math.floor(C.INVADERS_ENERGY_GOAL * (Math.random() * 0.6 + 0.7));
		if (Math.random() < 0.1) {
			invaderGoal *= Math.floor(Math.random() > 0.5 ? 2 : 0.5);
		}
		// Check neighbor rooms to filter exits leading to owned/reserved rooms
		const exitDirections = Game.map.describeExits(room.name);
		if (!exitDirections) {
			return;
		}
		const entries = Object.entries(exitDirections);
		// Load neighbor rooms; #user: string = owned/reserved, null = unowned, undefined = no controller
		context.task(async function() {
			const results = await Promise.all(
				Fn.map(entries, async ([ dir, neighborName ]) => {
					const neighbor = await context.shard.loadRoom(neighborName, undefined, true).catch(() => null);
					const user = neighbor?.['#user'];
					return user === null || user === undefined ? Number(dir) : undefined;
				}));
			return new Set(Fn.filter(results, (dir): dir is number => dir !== undefined));
		}(), (allowedDirs: Set<number>) => {
			// Filter exit positions to allowed directions only
			const validExits = [ ...Fn.filter(room.find(C.FIND_EXIT), pos => {
				if (pos.x === 0) return allowedDirs.has(C.LEFT);
				if (pos.x === 49) return allowedDirs.has(C.RIGHT);
				if (pos.y === 0) return allowedDirs.has(C.TOP);
				if (pos.y === 49) return allowedDirs.has(C.BOTTOM);
				return false;
			}) ];
			if (validExits.length === 0) {
				return;
			}

			// Only consume the energy budget when invaders actually spawn
			room['#invaderEnergyTarget'] = totalEnergy + invaderGoal;

			// Find raid origin from valid exits
			const origin = validExits[Math.floor(validExits.length * Math.random())];
			validExits.sort(mappedNumericComparator(pos => origin.getRangeTo(pos)));

			// Send the boys
			activateNPC(room, '2');
			for (let ii = 0; ii < 3; ++ii) {
				const role = ([ 'melee', 'healer', 'ranged' ] as Role[])[ii % 3];
				if (ii >= validExits.length) {
					break;
				}
				room['#insertObject'](create(validExits[ii], role, 'small', Game.time + C.CREEP_LIFE_TIME));
			}
		});
	}
});

// Add backend-only Invader request
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { invader: typeof intent }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function createBody(parts: Partial<Record<Creep.PartType, number>>) {
	const size = Fn.accumulate(Object.values(parts));
	return [
		...Fn.map(Fn.range(parts[C.TOUGH] ?? 0), () => C.TOUGH),
		...Fn.map(Fn.range(size - 1), () => C.MOVE),
		...Fn.transform(Object.entries(parts), ([ type, count ]) => {
			if (type === C.TOUGH) {
				return [];
			} else {
				return Fn.map(Fn.range(count), () => type as Creep.PartType);
			}
		}),
		C.MOVE,
	];
}
