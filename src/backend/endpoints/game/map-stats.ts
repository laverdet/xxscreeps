import type { Endpoint } from 'xxscreeps/backend';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/user/user';

export const MapStatsEndpoint: Endpoint = {
	method: 'post',
	path: '/api/game/map-stats',

	async execute(context) {
		const { rooms: roomNames } = context.request.body;
		if (!Array.isArray(roomNames) || !roomNames.every(room => /^[EW][0-9]+[NS][0-9]+$/.test(room))) {
			throw new Error('Invalid room payload');
		}

		// Read current room status
		// TODO: A room status blob that doesn't change very tick would be good
		const rooms = await Promise.all(roomNames.map(roomName =>
			context.backend.shard.loadRoom(roomName).catch(() => {}),
		));

		// Build rooms payload
		const userIds = new Set<string>();
		const stats = Fn.fromEntries(Fn.filter(rooms), room => {
			// Get room owner information
			const owner = function() {
				if (room.controller) {
					const user = room.controller.owner;
					if (user !== null) {
						userIds.add(user);
						return {
							own: {
								user,
								level: room.controller.level,
							},
							safeMode: false, //room.controller.safeMode !== undefined,
						};
					}
				}
			}();
			// Return status payload
			return [ room.name, {
				status: 'normal',
				...owner,
			} ];
		});

		// Read users
		const userObjects = await Promise.all(Fn.map(userIds, async id =>
			({ id, info: await context.db.data.hmget(User.infoKey(id), [ 'badge', 'username' ]) })));
		const users = Fn.fromEntries(userObjects, user => [
			user.id, {
				_id: user.id,
				badge: JSON.parse(user.info.badge!),
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
	},
};
