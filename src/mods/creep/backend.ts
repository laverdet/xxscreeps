import * as Fn from 'xxscreeps/utility/functional';
import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { Game } from 'xxscreeps/game';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { Creep } from './creep';

bindMapRenderer(Creep, creep => creep['#user']);

bindRenderer(Creep, (creep, next, previousTime) => {
	// Generate action log, catching up with skipped ticks
	const actionLog: Record<string, any> = Fn.fromEntries(
		Fn.filter(creep['#actionLog'], previousTime ?
			action => action.time > previousTime :
			action => action.time === Game.time),
		action => [ action.type, { x: action.x, y: action.y } ]);
	const saying = creep['#saying'];
	if (
		saying &&
		(!previousTime || previousTime < saying.time) &&
		(saying.isPublic || creep.my)
	) {
		actionLog.say = {
			isPublic: saying.isPublic,
			message: saying.message,
		};
	}
	return {
		...next(),
		...renderStore(creep.store),
		name: creep.name,
		body: creep.body,
		hits: creep.hits,
		hitsMax: 100,
		spawning: creep.spawning,
		fatigue: creep.fatigue,
		ageTime: creep['#ageTime'],
		user: creep['#user'],
		actionLog,
	};
});
