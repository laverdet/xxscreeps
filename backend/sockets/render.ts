import { bindRenderer } from 'xxscreeps/backend';
import { RoomObject } from 'xxscreeps/game/objects/room-object';
import { ConstructionSite } from 'xxscreeps/game/objects/construction-site';
import { Creep } from 'xxscreeps/game/objects/creep';
import { Resource } from 'xxscreeps/game/objects/resource';
import { Structure } from 'xxscreeps/game/objects/structures';
import { StructureContainer } from 'xxscreeps/game/objects/structures/container';
import { DowngradeTime, StructureController } from 'xxscreeps/game/objects/structures/controller';
import { StructureExtension } from 'xxscreeps/game/objects/structures/extension';
import { NextDecayTime, StructureRoad } from 'xxscreeps/game/objects/structures/road';
import { StructureSpawn } from 'xxscreeps/game/objects/structures/spawn';
import { StructureStorage } from 'xxscreeps/game/objects/structures/storage';
import { StructureTower } from 'xxscreeps/game/objects/structures/tower';
import { Capacity, Restricted, SingleResource, Store } from 'xxscreeps/game/store';
import { Variant } from 'xxscreeps/schema';

// Base object renderers
bindRenderer(RoomObject, object => ({
	_id: object.id,
	type: object[Variant as never],
	x: object.pos.x,
	y: object.pos.y,
}));

bindRenderer(Structure, (structure, next) => ({
	...next(),
	structureType: structure.structureType,
	hits: structure.hits,
	hitsMax: 100, //structure.hitsMax,
	user: structure._owner,
}));

// Store renderer
function renderStore(store: Store) {
	const result: any = {
		store: { ...store },
		storeCapacity: store.getCapacity(),
	};
	if (store[Restricted]) {
		if (store._capacityByResource) {
			const capacityByResource: any = {};
			for (const [ resourceType, value ] of store._capacityByResource.entries()) {
				capacityByResource[resourceType] = value;
			}
			result.storeCapacityResource = capacityByResource;
		} else {
			result.storeCapacityResource = { [store[SingleResource]!]: store[Capacity] };
		}
	}
	return result;
}

// Builtin renderers
bindRenderer(ConstructionSite, (constructionSite, next) => ({
	...next(),
	progress: constructionSite.progress,
	progressTotal: constructionSite.progressTotal,
	structureType: constructionSite.structureType,
	user: constructionSite._owner,
}));

bindRenderer(Creep, (creep, next) => ({
	...next(),
	...renderStore(creep.store),
	name: creep.name,
	body: creep.body,
	hits: creep.hits,
	hitsMax: 100,
	spawning: creep.spawning,
	fatigue: creep.fatigue,
	ageTime: creep._ageTime,
	user: creep._owner,
	actionLog: {
		attacked: null,
		healed: null,
		attack: null,
		rangedAttack: null,
		rangedMassAttack: null,
		rangedHeal: null,
		harvest: null,
		heal: null,
		repair: null,
		build: null,
		say: null,
		upgradeController: null,
		reserveController: null,
	},
}));

bindRenderer(Resource, (resource, next) => ({
	...next(),
	type: 'energy',
	resourceType: resource.resourceType,
	[resource.resourceType]: resource.amount,
}));

bindRenderer(StructureContainer, (container, next) => ({
	...next(),
	...renderStore(container.store),
	nextDecayTime: container._nextDecayTime,
}));

bindRenderer(StructureController, (controller, next) => ({
	...next(),
	level: controller.level,
	progress: controller.progress,
	downgradeTime: controller[DowngradeTime],
	safeMode: 0,
}));

bindRenderer(StructureExtension, (extension, next) => ({
	...next(),
	...renderStore(extension.store),
}));

bindRenderer(StructureRoad, (road, next) => ({
	...next(),
	nextDecayTime: road[NextDecayTime],
}));

bindRenderer(StructureSpawn, (spawn, next) => ({
	...next(),
	...renderStore(spawn.store),
	name: spawn.name,
}));

bindRenderer(StructureStorage, (storage, next) => ({
	...next(),
	...renderStore(storage.store),
}));

bindRenderer(StructureTower, (tower, next) => ({
	...next(),
	...renderStore(tower.store),
}));
