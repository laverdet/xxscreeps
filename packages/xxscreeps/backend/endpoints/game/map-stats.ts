import type { JSONSchemaType } from 'ajv';
import type { Endpoint } from 'xxscreeps/backend/index.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { UserBadge } from 'xxscreeps/engine/db/user/badge.js';
import { makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { Mineral } from 'xxscreeps/mods/mineral/mineral.js';
import { parseStatLayer, readRoomLayer } from 'xxscreeps/mods/stats/model.js';

interface MapStatsRequest {
	rooms: string[];
	// A stat layer to overlay, e.g. `energyHarvested8` (`<statName><interval>`).
	statName?: string | null;
}

const mapStatsSchema: JSONSchemaType<MapStatsRequest> = {
	type: 'object',
	properties: {
		rooms: { type: 'array', items: { type: 'string' } },
		statName: { type: 'string', nullable: true },
	},
	required: [ 'rooms' ],
};

// The near-static per-room fields map-stats serves for owner / mineral requests.
interface RoomMeta {
	own?: { user: string; level: number };
	sign?: { datetime: number; text: string; time: number; user: string };
	minerals0?: { type: string; density: number };
	safeModeUntil: number;
}

// `/api/game/map-stats` is polled for the whole visible map every few seconds; zoomed out that is
// thousands of rooms, and the owner / mineral requests (which don't resolve to a stat layer) would
// otherwise pay a full room-blob load + deserialize per room just to read a handful of near-static
// fields. Cache the derived metadata per room, stamped with the game time it was read at, and reuse
// it for a short window — owner / level / sign / mineral change rarely and slight staleness on the
// world map is invisible. Safe-mode is derived from the cached deadline at read time, so its accuracy
// is independent of the TTL. Unbounded like the terrain-endpoint cache: one small entry per room in
// the world, per backend thread.
const metaCache = new Map<string, { time: number; meta: RoomMeta }>();
// How many ticks a cached metadata entry stays valid before the room is reloaded.
const metaCacheTtl = 20;

async function loadRoomMeta(shard: Shard, roomName: string, time: number): Promise<RoomMeta> {
	const cached = metaCache.get(roomName);
	if (cached && time - cached.time < metaCacheTtl) {
		return cached.meta;
	}
	const room = await shard.loadRoom(roomName, undefined, true);
	const user = room['#user'];
	const sign = room['#sign'];
	const mineral = room['#objects'].find(instanceOfPredicate(Mineral));
	const meta: RoomMeta = {
		...user != null && { own: { user, level: room['#level'] } },
		...sign && { sign: { datetime: sign.datetime, text: sign.text, time: sign.time, user: sign.userId } },
		...mineral && { minerals0: { type: mineral.mineralType, density: mineral.density } },
		safeModeUntil: room['#safeModeUntil'],
	};
	metaCache.set(roomName, { time, meta });
	return meta;
}

export const MapStatsEndpoint: Endpoint = {
	method: 'post',
	path: '/api/game/map-stats',

	execute: makeValidatedPayloadRoute(mapStatsSchema, async context => {
		const { rooms: roomNames, statName } = context.request.body;
		if (!roomNames.every(room => /^[EW][0-9]+[NS][0-9]+$/.test(room))) {
			throw new Error('Invalid room payload');
		}

		const { time } = context.backend.shard;
		// A requested stat layer, if any, resolved to its stat + interval.
		const layer = statName == null ? undefined : parseStatLayer(statName);
		// `minerals0` is itself a requested layer name; only surface mineral data when it's the one asked for.
		const wantMineral = statName === 'minerals0';
		const userIds = new Set<string>();
		let layerMax = 0;
		const stats = Fn.fromEntries(Fn.filter(await Promise.all(Fn.map(roomNames, async roomName => {
			// The client spams requests for rooms that don't exist
			if (!context.backend.world.map.getRoomStatus(roomName, true)) {
				return;
			}

			// Near-static owner / level / sign / mineral metadata, served from the per-room cache to
			// avoid a full room load on every poll (see `loadRoomMeta`).
			const meta = await loadRoomMeta(context.backend.shard, roomName, time);
			if (meta.own) {
				userIds.add(meta.own.user);
			}
			if (meta.sign) {
				userIds.add(meta.sign.user);
			}

			// Stat layer: each contributing user's windowed value for the requested stat. Always read
			// live — it changes continuously and only the highest zoom (few rooms) ever requests it.
			const contributions = layer &&
				await readRoomLayer(context.backend.shard.data, roomName, layer.interval, layer.stat);
			if (contributions) {
				for (const contribution of contributions) {
					userIds.add(contribution.user);
					layerMax = Math.max(layerMax, contribution.value);
				}
			}

			// Build rooms payload
			return [ roomName, {
				status: 'normal',
				...meta.own && { own: meta.own },
				...meta.sign && { sign: meta.sign },
				...wantMineral && meta.minerals0 && { minerals0: meta.minerals0 },
				// Recomputed against the current tick so safe-mode accuracy doesn't depend on the TTL.
				...meta.safeModeUntil > time && {
					safeMode: true,
				},
				...contributions && contributions.length > 0 && {
					[statName!]: contributions,
				},
			} ] as const;
		}))));

		// Read users
		const userObjects = await Promise.all(Fn.map(userIds, async id =>
			({ id, info: await context.db.data.hmGet(User.infoKey(id), [ 'badge', 'username' ]) })));
		const users = Fn.fromEntries(userObjects, user => [
			user.id, {
				_id: user.id,
				badge: user.info.badge == null ? null : (JSON.parse(user.info.badge) as UserBadge),
				username: user.info.username!,
			},
		]);

		// Send it off
		return {
			ok: 1,
			gameTime: context.backend.shard.time,
			stats,
			statsMax: layer ? { [statName!]: layerMax } : {},
			users,
		};
	}),
};
