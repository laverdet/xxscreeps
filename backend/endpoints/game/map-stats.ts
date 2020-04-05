import { Endpoint } from '~/backend/endpoint';
import { filterInPlace, mapInPlace, mapToKeys, nonNullable } from '~/lib/utility';
import * as User from '~/engine/metadata/user';
import * as Room from '~/engine/schema/room';

export const MapStatsEndpoint: Endpoint = {
	method: 'post',
	path: '/map-stats',

	async execute(req) {
		const { rooms } = req.body;
		if (!Array.isArray(rooms) || !rooms.every(room => /^[EW][0-9]+[NS][0-9]+$/.test(room))) {
			throw new Error('Invalid room payload');
		}

		// Read current room status
		// TODO: A room status blob that doesn't change very tick would be good
		const { time } = this.context;
		const roomBlobs = await Promise.all(rooms.map(room =>
			this.context.blobStorage.load(`ticks/${time}/${room}`).catch(() => {}),
		));

		// Build rooms payload
		const userIds = new Set<string>();
		const stats = mapToKeys(filterInPlace(roomBlobs, nonNullable), blob => {
			const room = Room.read(blob);
			// Get room owner information
			const owner = function() {
				if (room.controller) {
					const user = room.controller._owner;
					if (user !== undefined) {
						userIds.add(user);
						return {
							own: {
								user,
								level: room.controller.level,
							},
							safeMode: room.controller.safeMode !== undefined,
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
		const userObjects = await Promise.all(
			mapInPlace(userIds, async id =>
				User.read(await this.context.blobStorage.load(`user/${id}/info`))));
		const users = mapToKeys(userObjects, user => [
			user.id, {
				_id: user.id,
				username: user.username,
				badge: JSON.parse(user.badge),
			},
		]);

		// Send it off
		return {
			ok: 1,
			gameTime: this.context.time,
			stats,
			users,
		};
	},
};
