import type { RouterContext } from 'koa-router';
import type { Context, State } from 'xxscreeps/backend/index.js';
import { hooks } from 'xxscreeps/backend/index.js';
import * as Model from './model.js';

// The official client drives the power-creep screen through these routes (`/api/game/power-creeps/*`).
// Each mutates account keyspace directly — there is no global-intent stage and no room presence yet.
// The model is the sole validator; routes are glue that maps a thrown rejection to `{ error }` and a
// success to `{ ok: 1 }`, the envelope the client expects.
type RouteContext = RouterContext<State, Context>;

interface Body {
	name?: unknown;
	className?: unknown;
	id?: unknown;
	powers?: unknown;
}

function mutation(run: (context: RouteContext, userId: string, body: Body) => Promise<unknown>) {
	return async (context: RouteContext) => {
		const { userId } = context.state;
		if (userId == null) {
			return { error: 'Not authenticated' };
		}
		try {
			await run(context, userId, context.request.body ?? {});
			return { ok: 1 };
		} catch (err) {
			return { error: err instanceof Error ? err.message : 'error' };
		}
	};
}

hooks.register('route', {
	path: '/api/game/power-creeps/list',
	async execute(context) {
		const { userId } = context.state;
		const roster = userId == null ? [] : await Model.loadRoster(context.db, userId);
		return { ok: 1, list: roster.map(record => Model.renderRecord(record)) };
	},
});

hooks.register('route', {
	path: '/api/game/power-creeps/create',
	method: 'post',
	execute: mutation((context, userId, body) => Model.create(context.db, userId, body.name, body.className)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/upgrade',
	method: 'post',
	execute: mutation((context, userId, body) => Model.upgrade(context.db, userId, body.id, body.powers)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/rename',
	method: 'post',
	execute: mutation((context, userId, body) => Model.rename(context.db, userId, body.id, body.name)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/delete',
	method: 'post',
	execute: mutation((context, userId, body) => Model.scheduleDelete(context.db, userId, body.id)),
});

hooks.register('route', {
	path: '/api/game/power-creeps/cancel-delete',
	method: 'post',
	execute: mutation((context, userId, body) => Model.cancelDelete(context.db, userId, body.id)),
});
