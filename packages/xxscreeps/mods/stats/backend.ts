import type { JSONSchemaType } from 'ajv';
import type { UserBadge } from 'xxscreeps/engine/db/user/badge.js';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import {
	bucketCount, isStatInterval, readRoomPunchcard, readRoomTotals, readTotals,
	removeAllForUser, statNames,
} from './model.js';

// `GET /api/user/stats?interval=8|180|1440` — aggregated per-interval totals for the profile page.
hooks.register('route', {
	path: '/api/user/stats',

	async execute(context) {
		const { userId } = context.state;
		const interval = Number(context.request.query.interval);
		if (userId == null || !isStatInterval(interval)) {
			return { ok: 1, stats: {} };
		}
		return { ok: 1, stats: await readTotals(context.db, userId, interval) };
	},
});

interface RoomOverviewQuery {
	room: string;
	interval?: string | null;
	shard?: string | null;
}

const roomOverviewSchema: JSONSchemaType<RoomOverviewQuery> = {
	type: 'object',
	properties: {
		room: { type: 'string' },
		interval: { type: 'string', nullable: true },
		shard: { type: 'string', nullable: true },
	},
	required: [ 'room' ],
};

// `GET /api/game/room-overview?room=W1N1&interval=8` — the room owner plus per-stat punchcards, the
// per-stat maxima the template scales by (keyed `<stat><interval>`), and windowed totals.
hooks.register('route', {
	path: '/api/game/room-overview',

	execute: makeValidatedQueryRoute(roomOverviewSchema, async context => {
		const { room } = context.request.query;
		if (!/^[EW][0-9]+[NS][0-9]+$/.test(room)) {
			throw new Error('Invalid room');
		}
		const rawInterval = Number(context.request.query.interval);
		const interval = isStatInterval(rawInterval) ? rawInterval : 8;
		const { shard } = context;

		// Room owner, when the room exists and is claimed. The overview shows the owner's activity.
		let owner: { username: string; badge: UserBadge | Record<string, never> } | undefined;
		let ownerId: string | undefined;
		if (context.backend.world.map.getRoomStatus(room, true)) {
			const roomObject = await shard.loadRoom(room, undefined, true).catch(() => undefined);
			ownerId = roomObject?.['#user'] ?? undefined;
			if (ownerId != null) {
				const info = await context.db.data.hmGet(User.infoKey(ownerId), [ 'badge', 'username' ]);
				owner = {
					username: info.username!,
					badge: info.badge == null ? {} : JSON.parse(info.badge) as UserBadge,
				};
			}
		}

		const now = Date.now();
		const punchcards = await Promise.all(statNames.map(async stat =>
			[ stat, ownerId == null ? new Array(bucketCount[interval]).fill(0) as number[]
			: await readRoomPunchcard(shard.data, room, ownerId, interval, stat, now) ] as const));
		const stats = Object.fromEntries(punchcards);
		const statsMax = Object.fromEntries(punchcards.map(([ stat, points ]) =>
			[ `${stat}${interval}`, Math.max(0, ...points) ]));
		const totals = ownerId == null ? {} : await readRoomTotals(shard.data, room, ownerId, interval, now);

		return { ok: 1, owner, stats, statsMax, totals };
	}),
});

// Tear down a removed user's stat series.
User.hooks.register('remove', removeAllForUser);
