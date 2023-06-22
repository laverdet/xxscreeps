import type { SubscriptionEndpoint } from 'xxscreeps/backend/socket.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { bindMapRenderer, bindTerrainRenderer } from 'xxscreeps/backend/index.js';
import { MapRender } from 'xxscreeps/backend/symbols.js';
import { subscribeToRoom } from './room.js';

// Register a map renderer on a `RoomObject` type
bindMapRenderer(RoomObject, () => undefined);
bindTerrainRenderer(RoomObject, () => undefined);

export const mapSubscription: SubscriptionEndpoint = {
	pattern: /^roomMap2:(?:(?<shard>[A-Za-z0-9]+)\/)?(?<room>[A-Z0-9]+)$/,

	async subscribe(parameters) {
		const roomName = parameters.room;
		if (!this.context.accessibleRooms.has(roomName)) {
			// The client sends subscription requests for rooms that don't exist. Filter those out here to
			// avoid unneeded subscriptions.
			return () => {};
		}
		let previous = '';
		return subscribeToRoom(this.context.shard, roomName, (room, time, didUpdate) => {
			if (!didUpdate) {
				return;
			}
			const response: Record<string, [ number, number ][]> = {};
			for (const object of room['#objects']) {
				const record = function() {
					const key = object[MapRender](object);
					if (key !== undefined) {
						return response[key] ??= [];
					}
				}();
				record?.push([ object.pos.x, object.pos.y ]);
			}
			const payload = JSON.stringify(response);
			if (payload !== previous) {
				previous = payload;
				this.send(payload);
			}
		});
	},
};
