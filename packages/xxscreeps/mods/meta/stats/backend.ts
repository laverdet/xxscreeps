import type { StatName } from './schema.js';
import type { JSONSchemaType } from 'ajv';
import type { UserBadge } from 'xxscreeps/engine/db/user/badge.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { mappedInvertedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import {
	bucketCount, isStatInterval, parseStatLayer, pendingBucketOffset, readRoomLayer,
	readRoomPunchcard, readRoomTotals, readUserTotals, removeAllForUser,
} from './model.js';
import { statNames } from './schema.js';

// A room's not-yet-flushed blob total for one user and stat; callers gate on `pendingBucketOffset`
// to place it within the window, or drop it
function pendingAmount(room: Room, userId: string, stat: StatName) {
	return Fn.accumulate(room['#userStats'], entry =>
		entry.userId === userId && entry.stat === stat ? entry.amount : 0);
}

// `GET /api/user/stats?id=<userId>&interval=8|180|1440` — aggregated per-interval totals for the
// profile page. The profile can show any user, so an explicit `id` wins over the logged-in user.
hooks.register('route', {
	path: '/api/user/stats',

	async execute(context) {
		const queryId = context.request.query.id;
		const targetId = (typeof queryId === 'string' && queryId) || context.state.userId;
		const interval = Number(context.request.query.interval);
		if (targetId == null || !isStatInterval(interval)) {
			return { ok: 1, stats: {} };
		}
		return { ok: 1, stats: await readUserTotals(context.db, targetId, interval) };
	},
});

interface RoomOverviewQuery {
	room: string;
	interval?: string | null;
}

const roomOverviewSchema: JSONSchemaType<RoomOverviewQuery> = {
	type: 'object',
	properties: {
		room: { type: 'string' },
		interval: { type: 'string', nullable: true },
	},
	required: [ 'room' ],
};

interface RoomOwner {
	username: string;
	badge: UserBadge | null;
}

// `GET /api/game/room-overview?room=W1N1&interval=8` — the room owner plus per-stat punchcards, the
// per-stat maxima the template scales by (keyed `<stat><interval>`), and windowed totals.
hooks.register('route', {
	path: '/api/game/room-overview',

	execute: makeValidatedQueryRoute(roomOverviewSchema, async context => {
		const { room: roomName } = context.request.query;
		if (!/^[EW][0-9]+[NS][0-9]+$/.test(roomName)) {
			throw new Error('Invalid room');
		}
		const rawInterval = Number(context.request.query.interval);
		const interval = isStatInterval(rawInterval) ? rawInterval : 8;
		const { shard } = context;

		// The overview shows the owner's activity; a missing or unclaimed room reads as all zeroes
		const room = context.backend.world.map.getRoomStatus(roomName, true)
			? await shard.loadRoom(roomName, undefined, true) : undefined;
		const ownerId = room?.['#user'] ?? undefined;
		if (room === undefined || ownerId === undefined) {
			return {
				ok: 1,
				stats: Fn.fromEntries(statNames, stat =>
					[ stat, new Array<number>(bucketCount[interval]).fill(0) ]),
				statsMax: Fn.fromEntries(statNames, stat => [ `${stat}${interval}`, 0 ]),
				totals: {},
			};
		}

		const now = Date.now();
		const offset = pendingBucketOffset(interval, room['#userStatsTime'], now);
		const [ info, punchcards, totals ] = await Promise.all([
			context.db.data.hmGet(User.infoKey(ownerId), [ 'badge', 'username' ]),
			Promise.all(statNames.map(async stat => {
				const points = await readRoomPunchcard(shard.data, roomName, ownerId, interval, stat, now);
				if (offset !== undefined) {
					points[offset]! += pendingAmount(room, ownerId, stat);
				}
				return [ stat, points ] as const;
			})),
			readRoomTotals(shard.data, roomName, ownerId, interval, now),
		]);
		if (offset !== undefined) {
			for (const stat of statNames) {
				totals[stat] += pendingAmount(room, ownerId, stat);
			}
		}
		const owner: RoomOwner = {
			username: info.username!,
			badge: info.badge == null ? null : JSON.parse(info.badge) as UserBadge,
		};
		const stats = Object.fromEntries(punchcards);
		const statsMax = Object.fromEntries(punchcards.map(([ stat, points ]) =>
			[ `${stat}${interval}`, Math.max(0, ...points) ]));
		return { ok: 1, owner, stats, statsMax, totals };
	}),
});

// World-map stat layer: every contributing user's windowed value for the requested stat, merged
// with each room's not-yet-flushed blob bucket
hooks.register('mapStats', async (context, payload) => {
	const { statName } = payload;
	if (statName === undefined) {
		return;
	}
	const layer = parseStatLayer(statName);
	if (layer === undefined) {
		return;
	}
	const now = Date.now();
	let max = 0;
	await Promise.all(payload.rooms.map(async ({ room, stats }) => {
		const contributions = await readRoomLayer(context.shard.data, room.name, layer.interval, layer.stat, now);
		if (pendingBucketOffset(layer.interval, room['#userStatsTime'], now) !== undefined) {
			for (const entry of room['#userStats']) {
				if (entry.stat === layer.stat) {
					const contribution = contributions.find(contribution => contribution.user === entry.userId);
					if (contribution) {
						contribution.value += entry.amount;
					} else {
						contributions.push({ user: entry.userId, value: entry.amount });
					}
				}
			}
			contributions.sort(mappedInvertedNumericComparator(contribution => contribution.value));
		}
		if (contributions.length > 0) {
			for (const contribution of contributions) {
				payload.userIds.add(contribution.user);
				max = Math.max(max, contribution.value);
			}
			stats[statName] = contributions;
		}
	}));
	payload.response.statsMax = { [statName]: max };
});

// Tear down a removed user's account-level stat series
User.hooks.register('remove', removeAllForUser);
