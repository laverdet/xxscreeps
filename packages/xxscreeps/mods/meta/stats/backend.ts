import type { JSONSchemaType } from 'ajv';
import { hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { mappedInvertedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { isStatInterval, parseStatLayer, pendingBucketOffset, readCompleteRoomPunchcard, readRoomLayer, readUserTotals, removeAllForUser } from './model.js';

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
	interval: string;
}

const roomOverviewSchema: JSONSchemaType<RoomOverviewQuery> = {
	type: 'object',
	properties: {
		interval: { type: 'string' },
		room: { type: 'string' },
	},
	required: [ 'interval', 'room' ],
};

// `GET /api/game/room-overview?room=W1N1&interval=8` — the room owner plus per-stat punchcards, the
// per-stat maxima the template scales by (keyed `<stat><interval>`), and windowed totals.
hooks.register('route', {
	path: '/api/game/room-overview',

	execute: makeValidatedQueryRoute(roomOverviewSchema, async context => {
		const { room: roomName } = context.request.query;
		const interval = Number(context.request.query.interval);
		if (!isStatInterval(interval)) {
			return;
		}
		const { backend, db, shard } = context;

		// Load request data
		const now = Date.now();
		const [ info, stats ] = await Promise.all([
			// Room & owner info
			async function() {
				const room =
					backend.world.map.getRoomStatus(roomName, true)
						? await shard.loadRoom(roomName, undefined, true)
						: undefined;
				if (room !== undefined) {
					const ownerId = room['#user'];
					const owner = ownerId == null ? undefined : await User.loadBackendUserInfo(db, ownerId);
					return [ room, owner ] as const;
				}
			}(),

			// Stats punchcard
			readCompleteRoomPunchcard(shard, roomName, interval, now),
		]);
		if (!info) {
			return;
		}
		const [ room, owner ] = info;

		// Add room pending stats to the latest bucket
		const offset = pendingBucketOffset(interval, room['#userStatsTime'], now);
		if (offset !== undefined) {
			for (const entry of room['#userStats']) {
				stats[entry.stat][offset]!.value += entry.amount;
			}
		}

		// The client uses these to calculate the radius of the punchcard circles
		const entries = Object.entries(stats);
		const statsMax = Fn.pipe(
			entries,
			$$ => Fn.map($$, ([ stat, punchcard ]) => {
				const total = Math.max(...Fn.map(punchcard, entry => entry.value));
				return [ `${stat}${interval}`, total ] as const;
			}),
			$$ => Fn.fromEntries($$));

		// This is used in the room header
		const totals = Fn.pipe(
			entries,
			$$ => Fn.map($$, ([ stat, punchcard ]) => {
				const total = Fn.accumulate(punchcard, entry => entry.value);
				return [ stat, total ] as const;
			}),
			$$ => Fn.fromEntries($$));

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
	await Fn.mapAwait(payload.rooms, async ({ room, stats }) => {
		const contributions = await readRoomLayer(context.shard, room.name, layer.interval, layer.stat, now);
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
	});
	payload.response.statsMax = { [statName]: max };
});

// Tear down a removed user's account-level stat series
User.hooks.register('remove', removeAllForUser);
