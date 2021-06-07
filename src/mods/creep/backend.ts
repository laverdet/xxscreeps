import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { renderActionLog } from 'xxscreeps/backend/sockets/render';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { Creep } from './creep';

bindMapRenderer(Creep, creep => creep['#user']);

bindRenderer(Creep, (creep, next, previousTime) => {
	// Inject `saying` into `actionLog`
	const actionLog = renderActionLog(creep['#actionLog'], previousTime);
	const saying = creep['#saying'];
	if (
		saying &&
		(!previousTime || previousTime < saying.time) &&
		(saying.isPublic || creep.my)
	) {
		actionLog.actionLog.say = {
			isPublic: saying.isPublic,
			message: saying.message,
		};
	}
	return {
		...next(),
		...renderStore(creep.store),
		...actionLog,
		name: creep.name,
		body: creep.body,
		hits: creep.hits,
		hitsMax: creep.hitsMax,
		spawning: creep.spawning,
		fatigue: creep.fatigue,
		ageTime: creep['#ageTime'],
		user: creep['#user'],
	};
});
