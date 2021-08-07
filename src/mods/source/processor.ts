import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as Creep from 'xxscreeps/mods/creep/creep';
import * as Fn from 'xxscreeps/utility/functional';
import * as Resource from 'xxscreeps/mods/resource/processor/resource';
import { StructureKeeperLair } from './keeper-lair';
import { Source } from './source';
import { activateNPC, registerNPC } from 'xxscreeps/mods/npc/processor';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor';
import { registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { calculatePower } from 'xxscreeps/mods/creep/creep';
import { Game } from 'xxscreeps/game';
import { search } from 'xxscreeps/driver/path-finder';
import { lookForStructures } from 'xxscreeps/mods/structure/structure';
import { iterateNeighbors } from 'xxscreeps/game/position';

registerHarvestProcessor(Source, (creep, source) => {
	const power = calculatePower(creep, C.WORK, C.HARVEST_POWER);
	const energy = Math.min(source.energy, power);
	const overflow = Math.max(energy - creep.store.getFreeCapacity('energy'), 0);
	creep.store['#add'](C.RESOURCE_ENERGY, energy - overflow);
	source.energy -= energy;
	if (overflow > 0) {
		Resource.drop(creep.pos, 'energy', overflow);
	}
	creep.room['#cumulativeEnergyHarvested'] += energy;
	return energy;
});

registerObjectTickProcessor(Source, (source, context) => {

	// Regenerate energy
	if (source.energy < source.energyCapacity) {
		if (source['#nextRegenerationTime'] === 0) {
			source['#nextRegenerationTime'] = Game.time + C.ENERGY_REGEN_TIME - 1;
			context.didUpdate();
		} else if (source.ticksToRegeneration === 0) {
			source.energy = source.energyCapacity;
			source['#nextRegenerationTime'] = 0;
			context.didUpdate();
		}
		context.wakeAt(source['#nextRegenerationTime']);
	} else if (source['#nextRegenerationTime'] !== 0) {
		source['#nextRegenerationTime'] = 0;
		context.didUpdate();
	}
});

registerObjectTickProcessor(StructureKeeperLair, (keeperLair, context) => {
	const keeperName = `Keeper${keeperLair.id}`;
	const keeper = keeperLair.room['#lookFor'](C.LOOK_CREEPS).find(creep =>
		creep['#user'] === '3' && creep.name === keeperName);

	if (keeperLair['#nextSpawnTime'] === 0) {
		// Start respawn timer
		if (!keeper || keeper.hits < 5000) {
			keeperLair['#nextSpawnTime'] = Game.time + C.ENERGY_REGEN_TIME - 1;
			context.didUpdate();
		}
		if (keeper) {
			context.wakeAt(keeper['#ageTime'] + 1);
		}
	} else if (keeperLair.ticksToSpawn === 0) {
		// Respawn keeper
		if (keeper) {
			keeperLair.room['#removeObject'](keeper);
		}
		const body = [
			...Fn.map(Fn.range(17), () => C.TOUGH),
			...Fn.map(Fn.range(13), () => C.MOVE),
			...Fn.concat(Fn.map(Fn.range(10), () => [ C.ATTACK, C.RANGED_ATTACK ])),
		];
		const newKeeper = Creep.create(keeperLair.pos, body, keeperName, '3');
		newKeeper['#ageTime'] = Game.time + C.CREEP_LIFE_TIME - 1;
		keeperLair.room['#insertObject'](newKeeper);
		keeperLair['#nextSpawnTime'] = 0;
		activateNPC(keeperLair.room, '3');
		context.setActive();
	} else if (keeperLair.room['#users'].presence.length > 1) {
		// Always activate NPC when player is in room
		activateNPC(keeperLair.room, '3');
		context.setActive();
	}
	// Make sure to wake room when it's time to spawn a new keeper
	context.wakeAt(keeperLair['#nextSpawnTime']);
});

registerNPC('3', Game => {
	let loop = false;
	const creeps = Object.values(Game.creeps);
	for (const creep of creeps) {

		// Find resource to protect
		const resource = Game.getObjectById<Source>(creep.memory.id ??= function() {
			const resources = [ ...creep.room.find(C.FIND_SOURCES), ...creep.room.find(C.FIND_MINERALS) ];
			const resource = resources.filter(resource =>
				creep.pos.inRangeTo(resource, 5) &&
				!creeps.some(creep => creep.memory.id === resource.id));

			if (resource.length === 1) {
				return resource[0].id;
			} else {
				// Multiple resources nearby. This is a more complete solution than the vanilla server
				// implements. The goal is to allow keepers to settle on a source so those rooms can idle
				const lairs = lookForStructures(creep.room, C.STRUCTURE_KEEPER_LAIR);
				const home = lairs.find(lair => creep.name === `Keeper${lair.id}`)!;
				const terrain = creep.room.getTerrain();
				const costTo = (origin: RoomPosition, goal: RoomPosition) => {
					// Search specifically to walkable nodes to handle the case where a source is neighboring
					// a keeper lair, but separated by a wall.
					const goals = Fn.reject(iterateNeighbors(goal), pos => terrain.get(pos.x, pos.y) === C.TERRAIN_MASK_WALL);
					const result = search(origin, [ ...goals ], { maxCost: 25 });
					return result.incomplete ? Infinity : result.cost;
				};

				// Search farthest resources first, to ensure that we get shortest total path length between
				// all lair :: source pairs
				const resourceInfo = resources.map(resource => ({
					cost: costTo(home.pos, resource.pos),
					resource,
				}));
				resources.sort((left, right) => costTo(home.pos, right.pos) - costTo(home.pos, left.pos));
				for (const { resource } of Fn.reject(resourceInfo, info => info.cost === Infinity)) {
					// Find distance to each lair from this resource
					const localLairs = lairs.filter(lair => resource.pos.inRangeTo(lair, 5)).map(lair => ({
						cost: costTo(resource.pos, lair.pos),
						lair,
					}));
					// Sort and iterate over all minimum equal-cost lairs
					localLairs.sort((left, right) => left.cost - right.cost);
					const closeLairs = Fn.filter(localLairs, lair => lair.cost === localLairs[0].cost);
					for (const lair of closeLairs) {
						if (lair.lair === home) {
							return resource.id;
						}
					}
				}
			}
		}()!);

		// Move towards it
		if (resource && !creep.pos.isNearTo(resource)) {
			creep.moveTo(resource, { maxRooms: 1 });
			loop = true;
		}

		// Find melee targets
		const enemies = creep.room.find(C.FIND_HOSTILE_CREEPS);
		if (enemies.length === 0) {
			continue;
		}
		loop = true;
		const meleeTarget = Fn.minimum(
			Fn.filter(enemies, enemy => creep.pos.isNearTo(enemy)),
			(left, right) => right.hits - left.hits)!;
		creep.attack(meleeTarget);

		// Find ranged targets
		const rangedTargets = [ ...Fn.filter(enemies, enemy => creep.pos.inRangeTo(enemy, 3)) ];
		const damageByRange = [ 10, 10, 4, 1 ];
		const massAttackDamage = Fn.accumulate(enemies, enemy => damageByRange[creep.pos.getRangeTo(enemy)]);
		if (massAttackDamage > 13) {
			creep.rangedMassAttack();
		} else {
			creep.rangedAttack(Fn.minimum(rangedTargets, (left, right) => right.hits - left.hits)!);
		}
	}
	return loop;
});
