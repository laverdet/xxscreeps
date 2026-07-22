import type { JSONSchemaType } from 'ajv';
import type { Endpoint } from 'xxscreeps/backend/index.js';
import { hooks, makeValidatedPayloadRoute } from 'xxscreeps/backend/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';

interface MapStatsRequest {
	rooms: string[];
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

const decorateMapStats = hooks.makeMapped('mapStats');

export const MapStatsEndpoint: Endpoint = {
	method: 'post',
	path: '/api/game/map-stats',

	execute: makeValidatedPayloadRoute(mapStatsSchema, async context => {
		const { rooms: roomNames, statName } = context.request.body;
		if (!roomNames.every(room => /^[EW][0-9]+[NS][0-9]+$/.test(room))) {
			throw new Error('Invalid room payload');
		}

		// TODO: A room status blob that doesn't change every tick would be good
		const rooms = [ ...Fn.filter(await Promise.all(Fn.map(roomNames, async roomName => {
			// The client spams requests for rooms that don't exist
			if (context.backend.world.map.getRoomStatus(roomName, true)) {
				return context.backend.shard.loadRoom(roomName, undefined, true);
			}
		}))) ];

		// Mods decorate the per-room payloads via `mapStats` hooks
		const payload = {
			...statName != null && { statName },
			rooms: rooms.map(room => ({ room, stats: { status: 'normal' } })),
			response: {},
			userIds: new Set<string>(),
		};
		// eslint-disable-next-line @typescript-eslint/await-thenable
		await Promise.all(decorateMapStats(context, payload));
		const stats = Fn.fromEntries(payload.rooms, ({ room, stats }) => [ room.name, stats ]);

		// Read users
		const users = Object.fromEntries(await Fn.mapAwait(payload.userIds, async id => {
			const info = {
				_id: id,
				...await User.loadBackendUserInfo(context.db, id),
			};
			return [ id, info ] as const;
		}));

		// Send it off
		return {
			ok: 1,
			gameTime: context.backend.shard.time,
			stats,
			users,
			...payload.response,
		};
	}),
};
