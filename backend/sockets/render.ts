import { mapToKeys } from 'xxscreeps/util/utility';
import { bindRenderer } from 'xxscreeps/backend';
import { RoomObject } from 'xxscreeps/game/object';
import { Creep } from 'xxscreeps/game/objects/creep';
import { Structure } from 'xxscreeps/game/objects/structures';
import { DowngradeTime, StructureController } from 'xxscreeps/game/objects/structures/controller';
import { StructureExtension } from 'xxscreeps/game/objects/structures/extension';
import { NextDecayTime, StructureRoad } from 'xxscreeps/game/objects/structures/road';
import { StructureSpawn } from 'xxscreeps/game/objects/structures/spawn';
import { StructureStorage } from 'xxscreeps/game/objects/structures/storage';
import { StructureTower } from 'xxscreeps/game/objects/structures/tower';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { ActionLog } from 'xxscreeps/game/objects/action-log';
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

// Builtin renderers
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
	actionLog: mapToKeys(creep[ActionLog], action =>
		[ action.action, { x: action.x, y: action.y } ]),
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
