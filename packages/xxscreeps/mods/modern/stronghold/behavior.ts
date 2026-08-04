import type { StructureInvaderCore } from './invader-core.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { RoomSearchOptions } from 'xxscreeps/game/pathfinder/index.js';
import type { RoomPosition } from 'xxscreeps/game/position.js';
import type { PartType } from 'xxscreeps/mods/classic/creep/creep.js';
import type { StructureRampart } from 'xxscreeps/mods/classic/defense/rampart.js';
import type { StructureTower } from 'xxscreeps/mods/classic/defense/tower.js';
import type { ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { Nuke } from 'xxscreeps/mods/modern/nuker/nuke.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { Game } from 'xxscreeps/game/index.js';
import { makePositionChecker } from 'xxscreeps/game/pathfinder/obstacle.js';
import { Creep, calculatePower } from 'xxscreeps/mods/classic/creep/creep.js';
import { calculateEfficiency } from 'xxscreeps/mods/classic/defense/tower.js';
import { kInvaderUserId } from 'xxscreeps/mods/classic/invader/game.js';
import { StructureRoad } from 'xxscreeps/mods/classic/road/road.js';
import { lookForStructureAt } from 'xxscreeps/mods/classic/structure/structure.js';
import { shuffle } from 'xxscreeps/utility/random.js';
import { hashCombine, removeOne } from 'xxscreeps/utility/utility.js';
import * as C from 'xxscreeps:mods/constants';

// Stronghold defense behaviors ported from @screeps/engine (invader-core/stronghold/stronghold.js,
// defence.js and creeps.js). Behaviors are keyed by the core's template name; vanilla stores the
// same value as a separate `strongholdBehavior`, always equal to the template name.

export interface StrongholdContext {
	core: StructureInvaderCore;
	defenders: Creep[];
	hostiles: Creep[];
	towers: StructureTower[];
	ramparts: StructureRampart[];
}

interface CreepSetup {
	body: PartType[];
	boosts: (ResourceType | null)[];
}

interface PopulationSlot extends CreepSetup {
	behavior: (creep: Creep, context: StrongholdContext, position?: RoomPosition) => void;
}

const towerRefillChance = [ 0, 0.01, 0.1, 0.3, 1, 1 ];

const makeBody = (segments: [ type: PartType, count: number, boost?: ResourceType ][]): CreepSetup => ({
	body: [ ...Fn.transform(segments, ([ type, count ]) => Fn.map(Fn.range(count), () => type)) ],
	boosts: [ ...Fn.transform(segments, ([ , count, boost ]) => Fn.map(Fn.range(count), () => boost ?? null)) ],
});
const weakDefender = makeBody([ [ C.ATTACK, 15 ], [ C.MOVE, 15 ] ]);
const fullDefender = makeBody([ [ C.ATTACK, 25 ], [ C.MOVE, 25 ] ]);
const fortifier = makeBody([ [ C.WORK, 15, C.RESOURCE_CATALYZED_LEMERGIUM_ACID ], [ C.CARRY, 15 ], [ C.MOVE, 15 ] ]);
const boostedDefender = makeBody([ [ C.ATTACK, 25, C.RESOURCE_UTRIUM_ACID ], [ C.MOVE, 25 ] ]);
const boostedRanger = makeBody([ [ C.RANGED_ATTACK, 25, C.RESOURCE_KEANIUM_ALKALIDE ], [ C.MOVE, 25 ] ]);
const fullBoostedMelee = makeBody([ [ C.ATTACK, 44, C.RESOURCE_CATALYZED_UTRIUM_ACID ], [ C.MOVE, 6, C.RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE ] ]);
const fullBoostedRanger = makeBody([ [ C.RANGED_ATTACK, 44, C.RESOURCE_CATALYZED_KEANIUM_ALKALIDE ], [ C.MOVE, 6, C.RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE ] ]);

function handleController(core: StructureInvaderCore) {
	const controller = core.room.controller;
	if (!controller) {
		return;
	}
	if (controller['#user'] === kInvaderUserId && controller.level > 0) {
		if ((controller.ticksToDowngrade ?? Infinity) < C.INVADER_CORE_CONTROLLER_DOWNGRADE - 25) {
			core['#upgradeController'](controller);
		}
		return;
	}
	const reserved = controller['#reservationEndTime'] > Game.time;
	if (!reserved || controller.room['#user'] === kInvaderUserId) {
		core['#reserveController'](controller);
	} else {
		core['#attackController'](controller);
	}
}

// Pump energy into the emptiest rampart-protected tower running low. Lower-level cores only
// tend their towers sporadically.
function refillTowers({ core, towers, ramparts }: StrongholdContext) {
	if (Math.random() > towerRefillChance[core.level]!) {
		return false;
	}
	const undercharged = towers.filter(tower =>
		tower.store.energy <= 2 * C.TOWER_ENERGY_COST &&
		ramparts.some(rampart => rampart.pos.isEqualTo(tower.pos)));
	const target = Fn.minimum(undercharged, mappedNumericComparator(tower => tower.store.energy));
	if (!target) {
		return false;
	}
	core['#transferEnergy'](target);
	return true;
}

// Top up the emptiest defender carrying less than half its capacity.
function refillCreeps({ core, defenders }: StrongholdContext) {
	const undercharged = defenders.filter(creep => {
		const capacity = creep.store.getCapacity();
		return capacity > 0 && 2 * creep.store.energy <= capacity;
	});
	const target = Fn.minimum(undercharged, mappedNumericComparator(creep => creep.store.energy));
	if (target) {
		core['#transferEnergy'](target);
	}
}

// The core makes one delivery a tick, and its towers have first claim on it.
function refill(context: StrongholdContext) {
	if (!refillTowers(context)) {
		refillCreeps(context);
	}
}

// The roads this core laid at deploy; its unowned peers are roads and reward containers.
function coreRoads(core: StructureInvaderCore) {
	return Fn.pipe(
		core['#ownedNeutralStructureIds'],
		$$ => Fn.map($$, id => Game.getObjectById(id)),
		$$ => Fn.filter($$, instanceOfPredicate(StructureRoad)));
}

// Spend one tower on upkeep — healing a damaged defender under a rampart, else repairing a damaged
// rampart-covered road — and yield the towers left free to shoot.
function towersMaintenance({ core, defenders, ramparts, towers }: StrongholdContext) {
	const [ tower ] = towers;
	if (!tower) {
		return towers;
	}
	const underRampart = (object: RoomObject) => ramparts.some(rampart => rampart.pos.isEqualTo(object.pos));
	const woundedDefender = defenders.find(defender => defender.hits < defender.hitsMax && underRampart(defender));
	if (woundedDefender) {
		tower.heal(woundedDefender);
		return towers.slice(1);
	}
	// Divergence from Screeps, which narrows the roads to the rampart-covered ones and then repairs
	// the first road of the *unnarrowed* list.
	const brokenRoad = Fn.find(coreRoads(core), road => road.hits < road.hitsMax && underRampart(road));
	if (brokenRoad) {
		tower.repair(brokenRoad);
		return towers.slice(1);
	}
	return towers;
}

// Every defender in reach opens up on the chosen hostile.
function attackWithDefenders(defenders: Creep[], target: Creep) {
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

// Every tower and every defender in reach attacks the hostile closest to the core.
function focusClosest({ core, defenders, hostiles, towers }: StrongholdContext) {
	const target = Fn.minimum(hostiles, mappedNumericComparator(hostile => hostile.pos.getRangeTo(core.pos)));
	if (!target) {
		return;
	}
	for (const tower of towers) {
		tower.attack(target);
	}
	attackWithDefenders(defenders, target);
}

// Damage the stronghold could land on `hostile` this tick. Tower output falls off with range, and a
// defender counts only for the weapons it has in reach.
// TODO: PWR_OPERATE_TOWER and PWR_DISRUPT_TOWER scale tower output once those powers land.
function damageAgainst(hostile: Creep, towers: StructureTower[], defenders: Creep[]) {
	return Fn.accumulate(towers, tower => Math.floor(C.TOWER_POWER_ATTACK * calculateEfficiency(tower, hostile))) +
		Fn.accumulate(defenders, defender => {
			const range = defender.pos.getRangeTo(hostile.pos);
			return (range <= 3 ? calculatePower(defender, C.RANGED_ATTACK, C.RANGED_ATTACK_POWER, 'rangedAttack') : 0) +
				(range <= 1 ? calculatePower(defender, C.ATTACK, C.ATTACK_POWER, 'attack') : 0);
		});
}

// Concentrate every charged tower and every defender in reach on the hostile that would take the
// most damage this tick, which is rarely the one nearest the core.
function focusMax({ defenders, hostiles }: StrongholdContext, towers: StructureTower[]) {
	const charged = towers.filter(tower => tower.store.energy >= C.TOWER_ENERGY_COST);
	const target = Fn.maximum(hostiles, mappedNumericComparator(hostile => damageAgainst(hostile, charged, defenders)));
	if (!target) {
		return;
	}
	attackWithDefenders(defenders, target);
	for (const tower of charged) {
		tower.attack(target);
	}
}

// Greedy weighted assignment: each defender takes the highest-weighted free post, and every post
// still open then loses weight in proportion to how close it sits to the one just taken, so the
// line spreads along the wall instead of bunching at one corner.
function *distribute(positions: RoomPosition[], defenders: Creep[]): Iterable<[ Creep, RoomPosition ]> {
	const weights = positions.map(pos => ({ pos, weight: 100 }));
	for (const defender of defenders) {
		const place = Fn.maximum(weights, mappedNumericComparator(entry => entry.weight));
		if (!place) {
			return;
		}
		removeOne(weights, place);
		for (const entry of weights) {
			entry.weight -= Math.max(0, weights.length - entry.pos.getRangeTo(place.pos));
		}
		yield [ defender, place.pos ];
	}
}

// Rampart tiles a hostile can be hit from: melee posts touch one, ranged posts are within three of
// one but not touching. Melee and ranged defenders are placed over their own posts independently.
function assignDefenders({ defenders, hostiles, ramparts }: StrongholdContext) {
	const meleeRamparts = ramparts.filter(rampart => hostiles.some(hostile => hostile.pos.isNearTo(rampart.pos)));
	const rangedRamparts = ramparts.filter(rampart =>
		hostiles.some(hostile => hostile.pos.inRangeTo(rampart.pos, 3)) && !meleeRamparts.includes(rampart));
	return new Map(Fn.concat([
		distribute(meleeRamparts.map(rampart => rampart.pos), defenders.filter(defender => defender.getActiveBodyparts(C.ATTACK) > 0)),
		distribute(rangedRamparts.map(rampart => rampart.pos), defenders.filter(defender => defender.getActiveBodyparts(C.RANGED_ATTACK) > 0)),
	]));
}

// Drive each named defender with its slot's behavior; spawn the first vacant slot. One spawn at a
// time — the core has a single incubation slot.
function maintainPopulation(context: StrongholdContext, population: PopulationSlot[], assignments?: Map<Creep, RoomPosition>) {
	const { core, defenders } = context;
	let spawnRequested = core.spawning !== null;
	for (const [ ii, slot ] of population.entries()) {
		const defender = defenders.find(creep => creep.name === `defender${ii}`);
		if (defender) {
			slot.behavior(defender, context, assignments?.get(defender));
		} else if (!spawnRequested) {
			core['#createCreep'](slot.body, `defender${ii}`, slot.boosts);
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
			const costs = ramparts.map(rampart =>
				[ rampart.pos, Math.max(1, matrix.get(rampart.pos.x, rampart.pos.y)) ] as const);
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

// An assigned defender walks to and holds its post. An unassigned one loitering on the core's
// doorstep while it incubates gives up the tile so the newborn has somewhere to land.
function coordinated(creep: Creep, context: StrongholdContext, position?: RoomPosition) {
	const { core } = context;
	if (position) {
		if (!creep.pos.isEqualTo(position)) {
			creep.moveTo(position, { ...makeSafeSearchOptions(context), range: 0 });
		}
	} else if (core.spawning && creep.pos.isNearTo(core.pos)) {
		// The retreat has to be a tile the creep can actually stand on: a stronghold packs its
		// defenders shoulder to shoulder, and heading for one a peer already holds would leave the
		// core wedged shut with nowhere to put the defender it is incubating.
		const standable = makePositionChecker({ checkTerrain: true, room: core.room, user: creep['#user'] });
		const retreat = Fn.minimum(
			Fn.filter(context.ramparts, rampart => !rampart.pos.isNearTo(core.pos) && standable(rampart.pos)),
			mappedNumericComparator(rampart => creep.pos.getRangeTo(rampart.pos)));
		if (retreat) {
			creep.moveTo(retreat, makeSafeSearchOptions(context));
		}
	}
}

// A rampart's repair goal: the core level's baseline, raised for every nuke about to land on or
// beside it. A rampart roofing a reward container is held at the baseline.
function rampartHitsTarget(core: StructureInvaderCore, rampart: StructureRampart, nukes: Nuke[]) {
	const baseline = C.STRONGHOLD_RAMPART_HITS[core.level]!;
	if (lookForStructureAt(core.room, rampart.pos, C.STRUCTURE_CONTAINER)) {
		return baseline;
	}
	return baseline + Fn.accumulate(nukes, nuke => {
		const range = rampart.pos.getRangeTo(nuke.pos);
		if (range === 0) {
			return C.NUKE_DAMAGE[0];
		}
		return range <= 2 ? C.NUKE_DAMAGE[2] : 0;
	});
}

// Bring the stronghold's ramparts back up to their target hit points, closing on the first one that
// needs it and patching whatever else is already in reach on the way.
function fortify(creep: Creep, context: StrongholdContext) {
	const { core, ramparts } = context;
	if (creep.store.energy === 0) {
		return;
	}
	// Only a bunker5 fortifies against an inbound nuke; every other bunker holds its baseline.
	const nukes = core['#templateName'] === 'bunker5' ? core.room.find(C.FIND_NUKES) : [];
	const repairable = ramparts.filter(rampart => rampart.hits < rampartHitsTarget(core, rampart, nukes));
	const [ target ] = repairable;
	if (!target) {
		return;
	}
	if (creep.pos.inRangeTo(target.pos, 3)) {
		creep.repair(target);
	} else {
		creep.moveTo(target, { ...makeSafeSearchOptions(context), range: 3 });
		const inReach = repairable.find(rampart => creep.pos.inRangeTo(rampart.pos, 3));
		if (inReach) {
			creep.repair(inReach);
		}
	}
}

const bunker2Population: PopulationSlot[] = [
	{ ...weakDefender, behavior: simpleMelee },
];

const bunker3Population: PopulationSlot[] = [
	{ ...fullDefender, behavior: simpleMelee },
	{ ...fullDefender, behavior: simpleMelee },
];

// Bunker4 and bunker5 field a hand dealt from a deck rather than a fixed roster. The deal is keyed
// off the core's id, so a stronghold fields the same roster every tick and across a restart without
// the roll ever being written down.
const fortifierSlot: PopulationSlot = { ...fortifier, behavior: fortify };

const bunker4Deck: PopulationSlot[] = [
	fortifierSlot,
	...Fn.map(Fn.range(4), () => ({ ...boostedDefender, behavior: coordinated })),
	...Fn.map(Fn.range(3), () => ({ ...boostedRanger, behavior: coordinated })),
];

const bunker5Deck: PopulationSlot[] = [
	fortifierSlot,
	...Fn.map(Fn.range(7), () => ({ ...fullBoostedMelee, behavior: coordinated })),
	...Fn.map(Fn.range(9), () => ({ ...fullBoostedRanger, behavior: coordinated })),
];

const dealSeed = (core: StructureInvaderCore) =>
	Fn.reduce(core.id, 0, (hash, character) => hashCombine(hash, character.charCodeAt(0)));

const bunker4Population = (core: StructureInvaderCore) => [ ...Fn.take(shuffle(bunker4Deck, dealSeed(core)), 4) ];

// A bunker5 always fields a fortifier; its deck holds a second one it may or may not deal.
const bunker5Population = (core: StructureInvaderCore) => [
	fortifierSlot,
	...Fn.take(shuffle(bunker5Deck, dealSeed(core)), 8),
];

function deploy({ core }: StrongholdContext) {
	handleController(core);
}

function defaultBehavior(context: StrongholdContext) {
	handleController(context.core);
	refillTowers(context);
	focusClosest(context);
}

function bunker1(context: StrongholdContext) {
	handleController(context.core);
	refill(context);
	focusClosest(context);
}

function bunker2(context: StrongholdContext) {
	handleController(context.core);
	refill(context);
	maintainPopulation(context, bunker2Population);
	focusClosest(context);
}

function bunker3(context: StrongholdContext) {
	handleController(context.core);
	refillTowers(context);
	maintainPopulation(context, bunker3Population);
	focusClosest(context);
}

// The two coordinated bunkers differ only in the deck they field.
const makeCoordinatedBehavior = (population: (core: StructureInvaderCore) => PopulationSlot[]) =>
	(context: StrongholdContext) => {
		handleController(context.core);
		refill(context);
		maintainPopulation(context, population(context.core), assignDefenders(context));
		focusMax(context, towersMaintenance(context));
	};

const bunkerBehaviors: Partial<Record<NonNullable<StructureInvaderCore['#templateName']>, (context: StrongholdContext) => void>> = {
	bunker1,
	bunker2,
	bunker3,
	bunker4: makeCoordinatedBehavior(bunker4Population),
	bunker5: makeCoordinatedBehavior(bunker5Population),
};

// A still-deploying core only tends the controller; a deployed one runs its bunker behavior, and a
// reservation core (no template) falls back to the basic defense set.
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
