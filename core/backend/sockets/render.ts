import * as Fn from 'xxscreeps/utility/functional';
import { bindRenderer } from 'xxscreeps/backend';
import { RoomObject } from 'xxscreeps/game/object';
import { Creep } from 'xxscreeps/game/objects/creep';
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
	user: creep.owner,
	actionLog: Fn.fromEntries(creep[ActionLog], action =>
		[ action.action, { x: action.x, y: action.y } ]),
}));
