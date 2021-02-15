import * as Room from 'xxscreeps/engine/schema/room';
import { Creep } from 'xxscreeps/game/objects/creep';
import { Source } from 'xxscreeps/game/objects/source';
import { Structure } from 'xxscreeps/game/objects/structures';
import { StructureController } from 'xxscreeps/game/objects/structures/controller';
import { StructureRoad } from 'xxscreeps/game/objects/structures/road';
import { mapToKeys } from 'xxscreeps/util/utility';
import { SubscriptionEndpoint } from '../socket';

type Position = [ number, number ];

export const mapSubscription: SubscriptionEndpoint = {
	pattern: /^roomMap2:(?<room>[A-Z0-9]+)$/,

	async subscribe(parameters) {
		const roomName = parameters.room;
		if (!this.context.accessibleRooms.has(roomName)) {
			// The client sends subscription requests for rooms that don't exist. Filter those out here to
			// avoid unneeded subscriptions.
			return () => {};
		}
		let lastTickTime = 0;
		let previous = '';
		const update = async() => {
			lastTickTime = Date.now();
			const roomBlob = await this.context.persistence.get(`room/${roomName}`);
			const room = Room.read(roomBlob);
			// w: constructedWall
			// r: road
			// pb: powerBank
			// p: portal
			// m: mineral
			// d: deposit
			// c: controller
			// k: keeperLair
			// e: energy | power
			const response = mapToKeys(
				[ 'w', 'r', 'pb', 'p', 's', 'm', 'd', 'c', 'k', 'e' ],
				key => [ key, [] as Position[] ],
			);
			for (const object of room._objects) {
				const record = function() {
					if (object instanceof StructureController) {
						return response.c;
					} else if (object instanceof StructureRoad) {
						return response.r;
					} else if (
						(object instanceof Creep || object instanceof Structure) &&
						object._owner !== undefined
					) {
						const owner: string = object._owner;
						// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
						return response[owner] ?? (response[owner] = []);
					} else if (object instanceof Source) {
						return response.s;
					}
				}();
				record?.push([ object.pos.x, object.pos.y ]);
			}

			const payload = JSON.stringify(response);
			if (payload !== previous) {
				previous = payload;
				this.send(payload);
			}
		};
		await update();
		return this.context.gameChannel.listen(event => {
			if (event.type === 'tick' && Date.now() > lastTickTime + 250) {
				update().catch(error => console.error(error));
			}
		});
	},
};
