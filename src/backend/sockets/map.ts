import { RoomObject } from 'xxscreeps/game/object';
import { getObjects } from 'xxscreeps/game/room/methods';
import { getOrSet } from 'xxscreeps/utility/utility';
import { bindMapRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { MapRender } from 'xxscreeps/backend/symbols';
import { SubscriptionEndpoint } from 'xxscreeps/backend/socket';

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
		let lastTickTime = 0;
		let previous = '';
		const update = async(time: number) => {
			lastTickTime = Date.now();
			const room = await this.context.shard.loadRoom(roomName, time);
			const response = new Map<string, [ number, number ][]>();
			for (const object of getObjects(room)) {
				const record = function() {
					const key = object[MapRender](object);
					if (key !== undefined) {
						return getOrSet(response, key, () => []);
					}
				}();
				record?.push([ object.pos.x, object.pos.y ]);
			}
			const payload = JSON.stringify(Object.fromEntries(response.entries()));
			if (payload !== previous) {
				previous = payload;
				this.send(payload);
			}
		};
		await update(this.context.shard.time);
		return this.context.shard.channel.listen(event => {
			if (event.type === 'tick' && Date.now() > lastTickTime + 250) {
				update(event.time).catch(error => console.error(error));
			}
		});
	},
};
