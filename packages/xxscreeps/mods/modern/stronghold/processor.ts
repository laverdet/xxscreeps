import type { StrongholdStructure, StrongholdTemplate } from './templates.js';
import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { StructureRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import type { StructureTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game } from 'xxscreeps/game/index.js';
import { optionalExpiryTime, saveAction } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { ConstructionSite } from 'xxscreeps/mods/classic/construction/construction-site.js';
import { StructureController } from 'xxscreeps/mods/classic/controller/controller.js';
import { release, reserve } from 'xxscreeps/mods/classic/controller/processor.js';
import * as Creep from 'xxscreeps/mods/classic/creep/creep.js';
import { buryCreep, flushActionLog } from 'xxscreeps/mods/classic/creep/processor.js';
import { create as createRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import { create as createTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { kInvaderUserId } from 'xxscreeps/mods/classic/invader/game.js';
import { loop as raidLoop } from 'xxscreeps/mods/classic/invader/loop/index.js';
import { create as createContainer } from 'xxscreeps/mods/classic/resource/container.js';
import { drop as dropResource } from 'xxscreeps/mods/classic/resource/processor/resource.js';
import { create as createRoad } from 'xxscreeps/mods/classic/road/road.js';
import { kSourceKeeperUserId } from 'xxscreeps/mods/classic/source/game.js';
import { birthSpawnCreep } from 'xxscreeps/mods/classic/spawn/processor.js';
import { Spawning } from 'xxscreeps/mods/classic/spawn/spawn.js';
import { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { registerNPC } from 'xxscreeps/mods/npc/processor.js';
import { assign } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';
import { strongholdBehavior } from './behavior.js';
import { StructureInvaderCore, checkAttackController, checkCreateCreep, checkReserveController, checkTransferEnergy, checkUpgradeController } from './invader-core.js';
import { calcReward, templates } from './templates.js';

// A room with an invader core is a stronghold; its creeps are defenders driven by the core's
// behavior rather than the raid logic. This registration replaces the raid loop registered by
// `classic/invader`, which is guaranteed to load first as a dependency of this mod.
registerNPC(kInvaderUserId, Game => {
	const room = Object.values(Game.rooms)[0];
	if (!room) {
		return false;
	}

	const structures = Object.values(Game.structures);
	const cores = structures.filter(
		(structure): structure is StructureInvaderCore =>
			structure.structureType === C.STRUCTURE_INVADER_CORE);
	if (cores.length === 0) {
		return raidLoop(Game);
	}

	const creeps = Object.values(Game.creeps);
	const context = {
		defenders: creeps.filter(creep => !creep.spawning),
		hostiles: room.find(C.FIND_HOSTILE_CREEPS).filter(creep => creep['#user'] !== kSourceKeeperUserId),
		towers: structures.filter(
			(structure): structure is StructureTower => structure.structureType === C.STRUCTURE_TOWER),
		ramparts: structures.filter(
			(structure): structure is StructureRampart => structure.structureType === C.STRUCTURE_RAMPART),
	};
	for (const core of cores) {
		strongholdBehavior(core)({ core, ...context });
	}
	return true;
});

export type StrongholdIntents = typeof intents;
// The five invader-core actions driven by the NPC loop.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(StructureInvaderCore, 'reserveController', {}, (core, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (checkReserveController(core, controller) === C.OK) {
			const power = C.INVADER_CORE_CONTROLLER_POWER * C.CONTROLLER_RESERVE;
			const endTime = (controller['#reservationEndTime'] || Game.time + 1) + power;
			if (endTime > Game.time + C.CONTROLLER_RESERVE_MAX) {
				return;
			}
			reserve(context, controller, kInvaderUserId, endTime);
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
			const creep = Creep.create(core.pos, body, name, kInvaderUserId);
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

// The core shadows that removal to first reset any owned controller in its room to neutral. A
// level-0 controller short-circuits so its reservation, if any, expires on its own.
registerObjectPreTickProcessor(StructureInvaderCore, (core, context, next) => {
	if (optionalExpiryTime(core['#collapseTime']) === 0) {
		const controller = core.room.controller;
		if (controller && controller.level > 0) {
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

// One structure of a deployed stronghold, created at its template position with the per-type loot
// and hit points. A decaying peer is pinned to the collapse time so it never reads a past expiry
// while the room sleeps until collapse. The caller stamps the shared collapse timer.
function createPeer(type: StrongholdStructure['type'], pos: RoomPosition, rewardLevel: number, collapseTime: number) {
	switch (type) {
		case C.STRUCTURE_RAMPART: {
			const rampart = createRampart(pos, kInvaderUserId);
			rampart.hits = C.STRONGHOLD_RAMPART_HITS[rewardLevel]!;
			rampart['#nextDecayTime'] = collapseTime;
			return rampart;
		}
		case C.STRUCTURE_TOWER: {
			const tower = createTower(pos, kInvaderUserId);
			tower.store['#add'](C.RESOURCE_ENERGY, C.TOWER_CAPACITY);
			return tower;
		}
		case C.STRUCTURE_CONTAINER: {
			const container = createContainer(pos);
			for (const [ resource, amount ] of calcReward(rewardLevel)) {
				container.store['#add'](resource, amount);
			}
			// Reward containers are withdraw-only
			container.store['#capacity'] = 0;
			container['#nextDecayTime'] = collapseTime;
			return container;
		}
		case C.STRUCTURE_ROAD: {
			const road = createRoad(pos);
			road['#nextDecayTime'] = collapseTime;
			return road;
		}
	}
}

// The structures a deployed stronghold spawns around its core, per its bunker template. Template
// peers freely share a tile (a rampart over a tower, container, or road).
function *strongholdTemplate(core: StructureInvaderCore, template: StrongholdTemplate, collapseTime: number) {
	const { rewardLevel } = template;
	for (const entry of template.structures) {
		const pos = new RoomPosition(core.pos.x + entry.dx, core.pos.y + entry.dy, core.pos.roomName);
		const peer = createPeer(entry.type, pos, rewardLevel, collapseTime);
		peer['#collapseTime'] = collapseTime;
		yield peer;
	}
}

// Crush whatever the template lands on: creeps on its tiles die, construction sites refund half
// their progress as dropped energy, and player-buildable structures are destroyed. Runs before any
// peer is inserted, so peers never crush each other on shared tiles.
function crushStrongholdTiles(core: StructureInvaderCore, template: StrongholdTemplate) {
	const { room } = core;
	const objects = Fn.pipe(
		template.structures,
		$$ => Fn.map($$, entry => new RoomPosition(core.pos.x + entry.dx, core.pos.y + entry.dy, core.pos.roomName)),
		$$ => Fn.map($$, pos => [ pos['#id'], pos ] as const),
		$$ => new Map($$),
		$$ => $$.values(),
		$$ => Fn.transform($$, pos => room['#lookAt'](pos)));
	for (const object of objects) {
		if (object instanceof Creep.Creep) {
			buryCreep(object);
		} else if (object instanceof ConstructionSite) {
			if (object.progress > 1) {
				dropResource(object.pos, C.RESOURCE_ENERGY, Math.floor(object.progress / 2));
			}
			room['#removeObject'](object);
		} else if (object instanceof Structure && object.structureType in C.CONSTRUCTION_COST) {
			object['#destroy']();
		}
	}
}

// Deploy the stronghold: drop the deploy timer, start the shared collapse timer, and spawn the
// template peers carrying that same timer so the whole stronghold vanishes together. Unowned peers
// are recorded on the core as its property.
function deployStronghold(core: StructureInvaderCore, context: ProcessorContext) {
	const templateName = core['#templateName'];
	if (templateName === undefined) {
		throw new Error('Deploying invader core has no stronghold template');
	}
	const template = templates[templateName];
	core['#deployTime'] = 0;
	const duration = Math.round(C.STRONGHOLD_DECAY_TICKS * (0.9 + Math.random() * 0.2));
	const collapseTime = core['#collapseTime'] = Game.time + duration;
	crushStrongholdTiles(core, template);
	for (const peer of strongholdTemplate(core, template, collapseTime)) {
		core.room['#insertObject'](peer);
		if (peer['#user'] === null) {
			core['#ownedNeutralStructureIds'].push(peer.id);
		}
	}
	context.wakeAt(collapseTime);
	context.didUpdate();
}
