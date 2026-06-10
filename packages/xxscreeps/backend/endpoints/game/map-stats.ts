import type { JSONSchemaType } from 'ajv';
import type { Endpoint } from 'xxscreeps/backend/index.js';
import type { UserBadge } from 'xxscreeps/engine/db/user/badge.js';
import { makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';

interface MapStatsRequest {
	rooms: string[];
}

const mapStatsSchema: JSONSchemaType<MapStatsRequest> = {
	type: 'object',
	properties: {
		rooms: { type: 'array', items: { type: 'string' } },
	},
	required: [ 'rooms' ],
};

export const MapStatsEndpoint: Endpoint = {
	method: 'post',
	path: '/api/game/map-stats',

	execute: makeValidatedPayloadRoute(mapStatsSchema, async context => {
		const { rooms: roomNames } = context.request.body;
		if (!roomNames.every(room => /^[EW][0-9]+[NS][0-9]+$/.test(room))) {
			throw new Error('Invalid room payload');
		}

		const { time } = context.backend.shard;
		const userIds = new Set<string>();
		const stats = Fn.fromEntries(Fn.filter(await Promise.all(Fn.map(roomNames, async roomName => {
			// The client spams requests for rooms that don't exist
			if (!context.backend.world.map.getRoomStatus(roomName, true)) {
				return;
			}

			// TODO: A room status blob that doesn't change every tick would be good
			const room = await context.backend.shard.loadRoom(roomName, undefined, true);

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
				...room['#safeModeUntil'] > time && {
					safeMode: true,
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
			users,
		};
	}),
};
