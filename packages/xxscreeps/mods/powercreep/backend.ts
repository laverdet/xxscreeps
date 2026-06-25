import type { JSONSchemaType } from 'ajv';
import type { Database } from 'xxscreeps/engine/db/index.js';
import { hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import * as Model from './model.js';

// The official client drives the power-creep screen through these routes (`/api/game/power-creeps/*`).
// Each mutates account keyspace directly — there is no global-intent stage and no room presence yet.
// The model is the sole validator; a thrown rejection maps to `{ error }`, success to `{ ok: 1 }`.
function mutationRoute<Body>(
	schema: JSONSchemaType<Body>,
	run: (db: Database, userId: string, body: Body) => Promise<unknown>,
) {
	return makeValidatedPayloadRoute(schema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return { error: 'not logged in' };
		}
		try {
			await run(context.db, userId, context.request.body);
			return { ok: 1 };
		} catch (err) {
			return { error: err instanceof Error ? err.message : 'error' };
		}
	});
}

const idSchema: JSONSchemaType<{ id: string }> = {
	type: 'object',
	properties: { id: { type: 'string' } },
	required: [ 'id' ],
};

const createSchema: JSONSchemaType<{ name: string; className: string }> = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		className: { type: 'string' },
	},
	required: [ 'name', 'className' ],
};

const upgradeSchema: JSONSchemaType<{ id: string; powers: Record<string, number> }> = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		powers: { type: 'object', required: [], additionalProperties: { type: 'number' } },
	},
	required: [ 'id', 'powers' ],
};

const renameSchema: JSONSchemaType<{ id: string; name: string }> = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
	},
	required: [ 'id', 'name' ],
};

hooks.register('route', {
	path: '/api/game/power-creeps/list',
	async execute(context) {
		const { userId } = context.state;
		const roster = userId == null ? [] : await Model.loadRoster(context.db, userId);
		return { ok: 1, list: roster.map(creep => Model.renderRecord(creep)) };
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
