import type { JSONSchemaType } from 'ajv';
import type { Database } from 'xxscreeps/engine/db/index.js';
import { bindMapRenderer, bindRenderer, hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { renderStore } from 'xxscreeps/mods/classic/resource/backend.js';
import * as C from 'xxscreeps:mods/constants';
import * as Model from './model.js';
import { PowerCreep } from './powercreep.js';

bindMapRenderer(PowerCreep, creep => creep['#user']);

bindRenderer(PowerCreep, (creep, next, previousTime) => {
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
		ageTime: creep['#ageTime'],
		className: creep.className,
		hits: creep.hits,
		hitsMax: creep.hitsMax,
		level: creep.level,
		name: creep.name,
		powers: creep.powers,
		user: creep['#user'],
	};
});

// The official client drives the power-creep screen through these routes (`/api/game/power-creeps/*`).
// The body schema validates shape; the model runs the shared `check*` and commits under compare-and-swap.
// A non-OK result code maps to `{ error }`, success to `{ ok: 1 }`.
function mutationRoute<Body>(
	schema: JSONSchemaType<Body>,
	run: (db: Database, userId: string, body: Body) => Promise<C.ErrorCode>,
) {
	return makeValidatedPayloadRoute(schema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return { error: 'not logged in' };
		}
		const code = await run(context.db, userId, context.request.body);
		return code === C.OK ? { ok: 1 } : { error: 'invalid' };
	});
}

interface PowerCreepSubjectRequest {
	id: string;
}

const idSchema: JSONSchemaType<PowerCreepSubjectRequest> = {
	type: 'object',
	properties: { id: { type: 'string' } },
	required: [ 'id' ],
};

interface PowerCreepCreateRequest {
	name: string;
	className: string;
}

const createSchema: JSONSchemaType<PowerCreepCreateRequest> = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		className: { type: 'string' },
	},
	required: [ 'name', 'className' ],
};

interface PowerCreepUpgradeRequest {
	id: string;
	powers: Record<string, number>;
}

const upgradeSchema: JSONSchemaType<PowerCreepUpgradeRequest> = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		powers: { type: 'object', required: [], additionalProperties: { type: 'number' } },
	},
	required: [ 'id', 'powers' ],
};

interface PowerCreepRenameRequest {
	id: string;
	name: string;
}

const renameSchema: JSONSchemaType<PowerCreepRenameRequest> = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
	},
	required: [ 'id', 'name' ],
};

/** Expand a roster member into the `/list` wire shape the client expects. */
function renderRecord(creep: PowerCreep) {
	const { level } = creep;
	return {
		_id: creep.id,
		name: creep.name,
		className: creep.className,
		level,
		hits: 1000 * (level + 1),
		hitsMax: 1000 * (level + 1),
		store: {},
		storeCapacity: 100 * (level + 1),
		spawnCooldownTime: creep.spawnCooldownTime,
		powers: creep.powers,
		...creep.deleteTime !== 0 && { deleteTime: creep.deleteTime },
	};
}

hooks.register('route', {
	path: '/api/game/power-creeps/list',
	async execute(context) {
		const { userId } = context.state;
		const roster = userId == null ? [] : await Model.loadRoster(context.db, userId);
		return { ok: 1, list: roster.map(creep => renderRecord(creep)) };
	},
});

hooks.register('route', {
	path: '/api/game/power-creeps/create',
	method: 'post',
	execute: mutationRoute(createSchema, (db, userId, body) => Model.create(db, userId, body.name, body.className)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/upgrade',
	method: 'post',
	execute: mutationRoute(upgradeSchema, (db, userId, body) => Model.upgrade(db, userId, body.id, body.powers)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/rename',
	method: 'post',
	execute: mutationRoute(renameSchema, (db, userId, body) => Model.rename(db, userId, body.id, body.name)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/delete',
	method: 'post',
	execute: mutationRoute(idSchema, (db, userId, body) => Model.scheduleDelete(db, userId, body.id)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/cancel-delete',
	method: 'post',
	execute: mutationRoute(idSchema, (db, userId, body) => Model.cancelDelete(db, userId, body.id)),
});
