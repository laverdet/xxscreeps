import type { StructureTower } from 'xxscreeps/mods/defense/tower.js';
import { registerIntentProcessor, registerObjectTickProcessor, registerRoomTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { release, reserve } from 'xxscreeps/mods/controller/processor.js';
import * as Creep from 'xxscreeps/mods/creep/creep.js';
import { flushActionLog } from 'xxscreeps/mods/creep/processor.js';
import { activateNPC, registerNPC } from 'xxscreeps/mods/npc/processor.js';
import { StructureInvaderCore, checkAttackController, checkReserveController, checkTransferEnergy, checkUpgradeController } from './invader-core.js';
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
		// TODO: describeExits return type is `null as never` — fix upstream in map.ts
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
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
			const origin = validExits[Math.floor(validExits.length * Math.random())]!;
			validExits.sort(mappedNumericComparator(pos => origin.getRangeTo(pos)));

			// Send the boys
			activateNPC(room, '2');
			for (let ii = 0; ii < 3; ++ii) {
				const role = ([ 'melee', 'healer', 'ranged' ] as const)[ii % 3]!;
				const exit = validExits[ii];
				if (exit) {
					room['#insertObject'](create(exit, role, 'small', Game.time + C.CREEP_LIFE_TIME));
				} else {
					break;
				}
			}
		});
	}
});

// Intent processors. Includes the backend-only `requestInvader` (Room) and the four
// invader-core actions driven by the NPC loop.
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { invader: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(Room, 'requestInvader', { internal: true }, (room, context, xx: number, yy: number, role: Role, strength: Strength) => {
		const pos = new RoomPosition(xx, yy, room.name);
		room['#insertObject'](create(pos, role, strength, Game.time + 200));
		activateNPC(room, '2');
		context.setActive();
	}),

	registerIntentProcessor(StructureInvaderCore, 'reserveController', {}, (core, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (checkReserveController(core, controller) === C.OK) {
			const power = C.INVADER_CORE_CONTROLLER_POWER * C.CONTROLLER_RESERVE;
			const endTime = (controller['#reservationEndTime'] || Game.time + 1) + power;
			if (endTime > Game.time + C.CONTROLLER_RESERVE_MAX) {
				return;
			}
			reserve(context, controller, '2', endTime);
			saveAction(core, 'reserveController', controller.pos);
			appendEventLog(controller.room, {
				event: C.EVENT_RESERVE_CONTROLLER,
				objectId: core.id,
				amount: power,
			});
		}
	}),

	registerIntentProcessor(StructureInvaderCore, 'attackController', {}, (core, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (checkAttackController(core, controller) === C.OK) {
			if (controller.level > 0) {
				controller['#downgradeTime'] -= C.INVADER_CORE_CONTROLLER_POWER * C.CONTROLLER_CLAIM_DOWNGRADE;
				controller['#upgradeBlockedUntil'] = Game.time + C.CONTROLLER_ATTACK_BLOCKED_UPGRADE - 1;
			} else {
				const reduced = controller['#reservationEndTime'] - C.INVADER_CORE_CONTROLLER_POWER * C.CONTROLLER_RESERVE;
				if (reduced <= Game.time) {
					release(context, controller);
				} else {
					controller['#reservationEndTime'] = reduced;
				}
			}
			// Divergence from Screeps, which logs this under `reserveController` — a copy/paste slip
			// in its core intent; the creep intent logs `attack`.
			saveAction(core, 'attack', controller.pos);
			appendEventLog(controller.room, {
				event: C.EVENT_ATTACK_CONTROLLER,
				objectId: core.id,
			});
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureInvaderCore, 'upgradeController', {}, (core, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (checkUpgradeController(core, controller) === C.OK) {
			const expiry = Game.time + C.INVADER_CORE_CONTROLLER_DOWNGRADE;
			controller['#downgradeTime'] = expiry;
			controller['#upgradeInvulnerableUntil'] = expiry;
			saveAction(core, 'upgradeController', controller.pos);
			appendEventLog(controller.room, {
				event: C.EVENT_UPGRADE_CONTROLLER,
				objectId: core.id,
				amount: 1,
				energySpent: 0,
			});
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureInvaderCore, 'transferEnergy', {}, (core, context, id: string, amount: number) => {
		const target = Game.getObjectById<StructureTower | Creep.Creep>(id);
		if (target && checkTransferEnergy(core, target) === C.OK) {
			const free = target.store.getFreeCapacity(C.RESOURCE_ENERGY)!;
			const actual = Math.min(amount, free);
			if (actual > 0) {
				target.store['#add'](C.RESOURCE_ENERGY, actual);
				saveAction(core, 'transferEnergy', target.pos);
				appendEventLog(core.room, {
					event: C.EVENT_TRANSFER,
					objectId: core.id,
					targetId: target.id,
					resourceType: C.RESOURCE_ENERGY,
					amount: actual,
				});
				context.didUpdate();
			}
		}
	}),
];

registerObjectTickProcessor(StructureInvaderCore, (core, context) => {
	const collapseTime = core['#collapseTime'];
	if (collapseTime > 0 && collapseTime <= Game.time) {
		// Collapse expiry is a silent removal: no ruin, no EVENT_OBJECT_DESTROYED. Those
		// only emit from the damage-destroy path, which collapse doesn't traverse. The NPC
		// reservation is left to run out; the controller's tick processor releases it at expiry.
		// TODO: Reset an NPC-owned controller here (user/level/effects) once stronghold
		// deployment can create one.
		core.room['#removeObject'](core);
		context.setActive();
		return;
	}

	flushActionLog(core['#actionLog'], context);

	// Clear the deploy timer the tick after it elapses. `ticksToDeploy`/`effects` read `#deployTime`
	// through `optionalExpiryTime`, which throws on a past time, so this branches on the raw field
	// rather than the getter. Zeroing lands in the blob read at `deployTime + 1` — one tick past the
	// core's last invulnerable tick (`Game.time === deployTime`, `ticksToDeploy === 0`).
	const deployTime = core['#deployTime'];
	if (deployTime !== 0) {
		if (deployTime < Game.time) {
			core['#deployTime'] = 0;
			context.didUpdate();
		} else {
			context.wakeAt(deployTime + 1);
		}
	}
	if (collapseTime > Game.time) context.wakeAt(collapseTime);
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
