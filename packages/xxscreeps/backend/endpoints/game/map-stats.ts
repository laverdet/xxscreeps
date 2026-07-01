import type { JSONSchemaType } from 'ajv';
import type { Endpoint } from 'xxscreeps/backend/index.js';
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
	shard?: string | null;
}

const mapStatsSchema: JSONSchemaType<MapStatsRequest> = {
	type: 'object',
	properties: {
		rooms: { type: 'array', items: { type: 'string' } },
		statName: { type: 'string', nullable: true },
		shard: { type: 'string', nullable: true },
	},
	required: [ 'rooms' ],
};

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
		const userIds = new Set<string>();
		let layerMax = 0;
		const stats = Fn.fromEntries(Fn.filter(await Promise.all(Fn.map(roomNames, async roomName => {
			// The client spams requests for rooms that don't exist
			if (!context.backend.world.map.getRoomStatus(roomName, true)) {
				return;
			}

			// TODO: A room status blob that doesn't change every tick would be good
			const room = await context.backend.shard.loadRoom(roomName, undefined, true);

			// Stat layer: each contributing user's windowed value for the requested stat.
			const contributions = layer &&
				await readRoomLayer(context.backend.shard.data, room.name, layer.interval, layer.stat);
			if (contributions) {
				for (const contribution of contributions) {
					userIds.add(contribution.user);
					layerMax = Math.max(layerMax, contribution.value);
				}
			}

			// Build rooms payload
			return [ room.name, {
				status: 'normal',
				// Owner, level information
				...function() {
					const user = room['#user'];
					if (user != null) {
						userIds.add(user);
						return {
							own: {
								user,
								level: room['#level'],
							},
						};
					}
				}(),
				// Sign
				...function() {
					const sign = room['#sign'];
					if (sign) {
						userIds.add(sign.userId);
						return {
							sign: {
								datetime: sign.datetime,
								text: sign.text,
								time: sign.time,
								user: sign.userId,
							},
						};
					}
				}(),
				// Mineral info
				...function() {
					const mineral = room['#objects'].find(instanceOfPredicate(Mineral));
					if (mineral) {
						return {
							minerals0: {
								type: mineral.mineralType,
								density: mineral.density,
							},
						};
					}
				}(),
				...room['#safeModeUntil'] > time && {
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
