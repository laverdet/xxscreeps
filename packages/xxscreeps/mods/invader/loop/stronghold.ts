import type { StructureInvaderCore } from '../invader-core.js';
import type { RoomSearchOptions } from 'xxscreeps/game/pathfinder/index.js';
import type { Creep, PartType } from 'xxscreeps/mods/classic/creep/creep.js';
import type { StructureRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import type { StructureTower } from 'xxscreeps/mods/classic/defense/tower.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game } from 'xxscreeps/game/index.js';
import * as C from 'xxscreeps:mods/constants';

// Stronghold defense behaviors ported from @screeps/engine (invader-core/stronghold/stronghold.js
// and creeps.js). Behaviors are keyed by the core's template name; vanilla stores the same value
// as a separate `strongholdBehavior`, always equal to the template name.

export interface StrongholdContext {
	core: StructureInvaderCore;
	defenders: Creep[];
	hostiles: Creep[];
	towers: StructureTower[];
	ramparts: StructureRampart[];
}

interface PopulationSlot {
	body: PartType[];
	behavior: (creep: Creep, context: StrongholdContext) => void;
}

const towerRefillChance = [ 0, 0.01, 0.1, 0.3, 1, 1 ];

const makeBody = (counts: [ type: PartType, count: number ][]) =>
	[ ...Fn.transform(counts, ([ type, count ]) => Fn.map(Fn.range(count), () => type)) ];
const weakDefender = makeBody([ [ C.ATTACK, 15 ], [ C.MOVE, 15 ] ]);
const fullDefender = makeBody([ [ C.ATTACK, 25 ], [ C.MOVE, 25 ] ]);

function handleController(core: StructureInvaderCore) {
	const controller = core.room.controller;
	if (!controller) {
		return;
	}
	if (controller['#user'] === '2' && controller.level > 0) {
		if ((controller.ticksToDowngrade ?? Infinity) < C.INVADER_CORE_CONTROLLER_DOWNGRADE - 25) {
			core['#upgradeController'](controller);
		}
		return;
	}
	const reserved = controller['#reservationEndTime'] > Game.time;
	if (!reserved || controller.room['#user'] === '2') {
		core['#reserveController'](controller);
	} else {
		core['#attackController'](controller);
	}
}

// Pump energy into the emptiest rampart-protected tower running low. Lower-level cores only
// tend their towers sporadically.
function refillTowers({ core, towers, ramparts }: StrongholdContext) {
	if (Math.random() > towerRefillChance[core.level]!) {
		return;
	}
	const undercharged = towers.filter(tower =>
		tower.store.energy <= 2 * C.TOWER_ENERGY_COST &&
		ramparts.some(rampart => rampart.pos.isEqualTo(tower.pos)));
	const target = Fn.minimum(undercharged, mappedNumericComparator(tower => tower.store.energy));
	if (target) {
		core['#transferEnergy'](target);
	}
}

// Every tower and every defender in reach attacks the hostile closest to the core.
function focusClosest({ core, defenders, hostiles, towers }: StrongholdContext) {
	const target = Fn.minimum(hostiles, mappedNumericComparator(hostile => hostile.pos.getRangeTo(core.pos)));
	if (!target) {
		return;
	}
	for (const tower of towers) {
		tower.attack(target);
	}
	for (const defender of defenders) {
		const range = defender.pos.getRangeTo(target.pos);
		if (range === 1 && defender.getActiveBodyparts(C.ATTACK) > 0) {
			defender.attack(target);
		}
		if (range <= 3 && defender.getActiveBodyparts(C.RANGED_ATTACK) > 0) {
			if (range === 1) {
				defender.rangedMassAttack();
			} else {
				defender.rangedAttack(target);
			}
		}
	}
}

// Drive each named defender with its slot's behavior; spawn the first vacant slot. One spawn at a
// time — the core has a single incubation slot.
function maintainPopulation(context: StrongholdContext, population: PopulationSlot[]) {
	const { core, defenders } = context;
	let spawnRequested = core.spawning !== null;
	for (const [ ii, slot ] of population.entries()) {
		const defender = defenders.find(creep => creep.name === `defender${ii}`);
		if (defender) {
			slot.behavior(defender, context);
		} else if (!spawnRequested) {
			core['#createCreep'](slot.body, `defender${ii}`);
			spawnRequested = true;
		}
	}
}

// Defender movement is confined to the stronghold's ramparts: every tile is impassable except
// rampart tiles, which keep their underlying cost so one occupied by an obstacle structure (a
// tower, the core) stays blocked.
function makeSafeSearchOptions({ ramparts }: StrongholdContext): RoomSearchOptions {
	return {
		ignoreCreeps: true,
		costCallback(roomName, matrix) {
			const costs = [ ...Fn.map(ramparts, rampart =>
				[ rampart.pos, Math.max(1, matrix.get(rampart.pos.x, rampart.pos.y)) ] as const) ];
			matrix._bits.fill(0xff);
			for (const [ pos, cost ] of costs) {
				matrix.set(pos.x, pos.y, cost);
			}
			return matrix;
		},
	};
}

function simpleMelee(creep: Creep, context: StrongholdContext) {
	const options = makeSafeSearchOptions(context);
	const target = creep.pos.findClosestByPath(context.hostiles, options);
	if (!target) {
		return;
	}
	if (creep.pos.isNearTo(target)) {
		creep.attack(target);
	} else {
		creep.moveTo(target, options);
	}
}

const bunker2Population: PopulationSlot[] = [
	{ body: weakDefender, behavior: simpleMelee },
];

const bunker3Population: PopulationSlot[] = [
	{ body: fullDefender, behavior: simpleMelee },
	{ body: fullDefender, behavior: simpleMelee },
];

function deploy({ core }: StrongholdContext) {
	handleController(core);
}

function defaultBehavior(context: StrongholdContext) {
	handleController(context.core);
	refillTowers(context);
	focusClosest(context);
}

function bunker2(context: StrongholdContext) {
	handleController(context.core);
	refillTowers(context);
	maintainPopulation(context, bunker2Population);
	focusClosest(context);
}

function bunker3(context: StrongholdContext) {
	handleController(context.core);
	refillTowers(context);
	maintainPopulation(context, bunker3Population);
	focusClosest(context);
}

const bunkerBehaviors: Partial<Record<NonNullable<StructureInvaderCore['#templateName']>, (context: StrongholdContext) => void>> = {
	bunker1: defaultBehavior,
	bunker2,
	bunker3,
};

// A still-deploying core only tends the controller; a deployed one runs its bunker behavior, and a
// reservation core (no template) or a bunker4/5 core falls back to the basic defense set.
export function strongholdBehavior(core: StructureInvaderCore) {
	if (core.ticksToDeploy !== undefined) {
		return deploy;
	}
	const templateName = core['#templateName'];
	if (templateName === undefined) {
		return defaultBehavior;
	}
	return bunkerBehaviors[templateName] ?? defaultBehavior;
}
