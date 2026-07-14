import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { StructureTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor, registerRoomTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { optionalExpiryTime, saveAction } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
import { release, reserve } from 'xxscreeps/mods/classic/controller/processor.js';
import * as Creep from 'xxscreeps/mods/classic/creep/creep.js';
import { flushActionLog } from 'xxscreeps/mods/classic/creep/processor.js';
import { create as createRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import { create as createTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { activateNPC, registerNPC } from 'xxscreeps/mods/npc/processor.js';
import { create as createContainer } from 'xxscreeps/mods/classic/resource/container.js';
import { create as createRoad } from 'xxscreeps/mods/classic/road/road.js';
import { birthSpawnCreep } from 'xxscreeps/mods/classic/spawn/processor.js';
import { Spawning } from 'xxscreeps/mods/classic/spawn/spawn.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { assign } from 'xxscreeps/utility/utility.js';
import { StructureInvaderCore, checkAttackController, checkCreateCreep, checkReserveController, checkTransferEnergy, checkUpgradeController } from './invader-core.js';
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

	registerIntentProcessor(StructureInvaderCore, 'createCreep', {}, (core, context, body: Creep.PartType[], name: string) => {
		if (checkCreateCreep(core) === C.OK) {
			// Incubate the defender on the core's own tile (`#ageTime === 0` marks it spawning); the
			// object tick processor spawns it onto an adjacent tile once the timer elapses.
			const creep = Creep.create(core.pos, body, name, '2');
			creep['#ageTime'] = 0;
			core.room['#insertObject'](creep);
			const needTime = C.INVADER_CORE_CREEP_SPAWN_TIME[core.level]! * body.length;
			const spawning = core.spawning = assign(new Spawning(), { needTime });
			spawning['#spawnId'] = core.id;
			spawning['#spawningCreepId'] = creep.id;
			spawning['#spawnTime'] = Game.time + needTime - 1;
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

// Wire up collapse for stronghold objects
registerObjectPreTickProcessor(Structure, (structure, context) => {
	if (optionalExpiryTime(structure['#collapseTime']) === 0) {
		structure.room['#removeObject'](structure);
		context.didUpdate();
	}
});

// The core shadows that removal to first release a controller it had taken over. Its reservation, if
// any, is left to expire on its own — a level-0 controller short-circuits before the release.
registerObjectPreTickProcessor(StructureInvaderCore, (core, context, next) => {
	if (optionalExpiryTime(core['#collapseTime']) === 0) {
		const controller = core.room.controller;
		if (controller && controller.level > 0 && core.room['#user'] === '2') {
			release(context, controller);
			controller['#upgradeInvulnerableUntil'] = 0;
		}
		next();
	}
});

registerObjectTickProcessor(StructureInvaderCore, (core, context) => {
	context.wakeAt(core['#collapseTime']);

	flushActionLog(core['#actionLog'], context);

	// Deploy the stronghold once the deploy timer elapses. `ticksToDeploy` already clamps to
	// `undefined` from `deployTime + 1`, but the raw field has to be cleared by `deployTime + 2` or
	// its `requiredExpiryTime` read throws; the `wakeAt` below guarantees a processing tick at
	// `deployTime + 1` to do it.
	const deployTime = core['#deployTime'];
	if (deployTime !== 0) {
		if (deployTime < Game.time) {
			deployStronghold(core, context);
		} else {
			context.wakeAt(deployTime + 1);
		}
	}

	// Advance an in-progress defender spawn. A player spawn's room is kept ticking by its energy
	// regen; this NPC core has none, so wake it at completion.
	const { spawning } = core;
	if (spawning) {
		if (spawning.remainingTime === 0) {
			birthSpawnCreep(core, context, () => core['#collapseTime'] || Game.time + C.CREEP_LIFE_TIME - 1);
		} else {
			context.wakeAt(spawning['#spawnTime']);
		}
	}
});

// The structures a deployed stronghold spawns around its core. A stub layout; the canonical bunker
// templates and their reward containers land in a follow-up. Decaying peers are pinned to the
// collapse time so they don't decay (and read a past expiry) while the room sleeps until collapse.
function strongholdTemplate(pos: RoomPosition, collapseTime: number) {
	const tower = createTower(new RoomPosition(pos.x, pos.y - 1, pos.roomName), '2');
	const rampart = createRampart(new RoomPosition(pos.x + 1, pos.y, pos.roomName), '2');
	const container = createContainer(new RoomPosition(pos.x - 1, pos.y, pos.roomName));
	const road = createRoad(new RoomPosition(pos.x, pos.y + 1, pos.roomName));
	rampart['#nextDecayTime'] = collapseTime;
	container['#nextDecayTime'] = collapseTime;
	road['#nextDecayTime'] = collapseTime;
	return [ tower, rampart, container, road ];
}

// Deploy the stronghold: drop the deploy timer, start the shared collapse timer, and spawn the
// template peers carrying that same timer so the whole stronghold vanishes together.
function deployStronghold(core: StructureInvaderCore, context: ProcessorContext) {
	core['#deployTime'] = 0;
	const duration = Math.round(C.STRONGHOLD_DECAY_TICKS * (0.9 + Math.random() * 0.2));
	const collapseTime = core['#collapseTime'] = Game.time + duration;
	for (const peer of strongholdTemplate(core.pos, collapseTime)) {
		peer['#collapseTime'] = collapseTime;
		core.room['#insertObject'](peer);
	}
	context.wakeAt(collapseTime);
	context.didUpdate();
}

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
