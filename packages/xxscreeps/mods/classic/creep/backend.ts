import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { renderStore } from 'xxscreeps/mods/classic/resource/backend.js';
import { Creep } from './creep.js';
import { Tombstone } from './tombstone.js';

bindMapRenderer(Creep, creep => creep['#user']);

bindRenderer(Creep, (creep, next, previousTime) => {
	// Inject `saying` into `actionLog`
	const actionLog: Record<string, unknown> = renderActionLog(creep['#actionLog'], previousTime);
	const saying = creep['#saying'];
	if (
		saying &&
		(previousTime === undefined || previousTime < saying.time) &&
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
		actionLog,
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

bindRenderer(Tombstone, (tombstone, next) => {
	const creep = tombstone['#creep'];
	return {
		...next(),
		...renderStore(tombstone.store),
		creepBody: creep.body,
		creepId: creep.id,
		creepName: creep.name,
		creepTicksToLive: creep.ticksToLive,
		creepSaying: creep.saying,
		deathTime: tombstone.deathTime,
		decayTime: tombstone['#decayTime'],
		user: creep.user,
	};
});
