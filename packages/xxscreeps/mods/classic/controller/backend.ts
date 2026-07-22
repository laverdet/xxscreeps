import type { JSONSchemaType } from 'ajv';
import { bindMapRenderer, bindRenderer, bindTerrainRenderer, hooks, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { userToIntentRoomsSetKey, userToPresenceRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { isStatInterval, readRoomPunchcard, readUserTotals } from 'xxscreeps/mods/meta/stats/model.js';
import { isStatName } from 'xxscreeps/mods/meta/stats/schema.js';
import { StructureController } from './controller.js';
import { controlledRoomsKey, reservedRoomsKey } from './model.js';

bindMapRenderer(StructureController, () => 'c');
bindTerrainRenderer(StructureController, () => 0x505050);

bindRenderer(StructureController, (controller, next) => {
	const reservationEndTime = controller['#reservationEndTime'];
	const sign = controller.room['#sign'];
	return {
		...next(),
		level: controller.level,
		progress: controller.progress,
		downgradeTime: controller['#downgradeTime'],
		safeMode: controller.room['#safeModeUntil'],
		safeModeAvailable: controller.safeModeAvailable,
		safeModeCooldown: controller['#safeModeCooldownTime'],
		...reservationEndTime > 0 && {
			reservation: {
				endTime: reservationEndTime,
				user: controller.room['#user'],
			},
		},
		...sign && {
			sign: {
				datetime: sign.datetime,
				time: sign.time,
				text: sign.text,
				user: sign.userId,
			},
		},
	};
});

// Surface accumulated control points (GCL experience) so the client can display the Global Control Level.
hooks.register('sendUserInfo', async (db, userId, userInfo) => {
	userInfo.gcl = Number(await db.data.hGet(User.infoKey(userId), 'gcl')) || 0;
});

// Owner / level, sign, and safe-mode world-map decorations; these fields live on this mod's room
// schema.
hooks.register('mapStats', (context, { rooms, userIds }) => {
	const { time } = context.backend.shard;
	for (const { room, stats } of rooms) {
		const user = room['#user'];
		if (user != null) {
			userIds.add(user);
			stats.own = { user, level: room['#level'] };
		}
		const sign = room['#sign'];
		if (sign) {
			userIds.add(sign.userId);
			stats.sign = { datetime: sign.datetime, text: sign.text, time: sign.time, user: sign.userId };
		}
		if (room['#safeModeUntil'] > time) {
			stats.safeMode = true;
		}
	}
});

interface RoomStatusQuery {
	id: string;
}

const userRoomsQuerySchema: JSONSchemaType<RoomStatusQuery> = {
	type: 'object',
	properties: {
		id: { type: 'string' },
	},
	required: [ 'id' ],
};

hooks.register('route', {
	path: '/api/user/rooms',
	execute: makeValidatedQueryRoute(userRoomsQuerySchema, async context => {
		const { shard } = context;
		const { id: userId } = context.request.query;
		const [ controlled, reserved ] = await Promise.all([
			shard.scratch.sMembers(controlledRoomsKey(userId)),
			shard.scratch.sMembers(reservedRoomsKey(userId)),
		]);
		return {
			ok: 1,
			shards: {
				[shard.name]: controlled,
			},
			reservations: {
				[shard.name]: reserved,
			},
		};
	}),
});

hooks.register('route', {
	path: '/api/user/overview',

	async execute(context) {
		const { userId } = context.state;
		const { shard } = context;
		if (userId == null) {
			return { ok: 1, shards: { [shard.name]: { rooms: [], stats: {} } }, statsMax: 0, totals: {} };
		}

		const rawInterval = Number(context.request.query.interval);
		const interval = isStatInterval(rawInterval) ? rawInterval : 8;
		// TODO: Types on this query shape
		const statNameRaw = String(context.request.query.statName);
		const statName = isStatName(statNameRaw) ? statNameRaw : 'energyHarvested';
		const [ rooms, totals ] = await Promise.all([
			shard.scratch.sMembers(controlledRoomsKey(userId)),
			readUserTotals(context.db, userId, interval),
		]);
		// Per-room punchcard of the user's own activity for the selected stat, plus the max across
		// them. The client reads the punchcards from `shards[name].stats[room]` and `statsMax` off
		// the top.
		const series = await Fn.mapAwait(rooms, async room => {
			const punchcard = await readRoomPunchcard(shard.data, room, userId, interval, statName);
			return [ room, punchcard ] as const;
		});
		const stats = Object.fromEntries(series);
		const statsMax = Math.max(0, ...Fn.transform(series, ([ ,points ]) => points));
		return {
			ok: 1,
			shards: {
				[shard.name]: { rooms, stats },
			},
			statsMax,
			totals,
		};
	},
});

hooks.register('route', {
	path: '/api/user/world-status',

	async execute(context) {
		const { userId } = context.state;
		if (userId == null) {
			return { ok: 1, status: 'normal' };
		}
		const [ controlled, intents, presence ] = await Promise.all([
			context.shard.scratch.sCard(controlledRoomsKey(userId)),
			context.shard.scratch.sCard(userToIntentRoomsSetKey(userId)),
			context.shard.scratch.sCard(userToPresenceRoomsSetKey(userId)),
		]);
		if (presence > 0) {
			if (intents > 0 && controlled > 0) {
				return { ok: 1, status: 'normal' };
			} else {
				return { ok: 1, status: 'lost' };
			}
		} else {
			return { ok: 1, status: 'empty' };
		}
	},
});
