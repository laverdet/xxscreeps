import { readRoom } from '~/engine/schema';
import { Objects } from '~/game/room';
import { Owner } from '~/game/objects/room-object';
import { Creep } from '~/game/objects/creep';
import { Source } from '~/game/objects/source';
import { Structure } from '~/game/objects/structures';
import { mapToKeys } from '~/lib/utility';
import { SubscriptionEndpoint } from '../socket';

type Position = [ number, number ];

export const mapSubscription: SubscriptionEndpoint = {
	pattern: /^roomMap2:(?<room>[A-Z0-9]+)$/,

	subscribe(parameters) {
		const roomName = parameters.room;
		if (!this.context.accessibleRooms.has(roomName)) {
			// The client sends subscription requests for rooms that don't exist. Filter those out here to
			// avoid unneeded subscriptions.
			return () => {};
		}
		let lastTickTime = 0;
		const update = async(time: number) => {
			lastTickTime = Date.now();
			const roomBlob = await this.context.blobStorage.load(`ticks/${time}/${roomName}`);
			const room = readRoom(roomBlob);
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
			for (const object of room[Objects]) {

				if (object instanceof Creep || object instanceof Structure) {
					const owner = (object as any)[Owner]; // is this a typescript bug?
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
					const userObjects = response[owner] ?? (response[owner] = []);
					userObjects.push([ object.pos.x, object.pos.y ]);

				} else if (object instanceof Source) {
					response.s.push([ object.pos.x, object.pos.y ]);
				}
			}
			this.send(JSON.stringify(response));
		};
		return this.context.gameChannel.listen(event => {
			if (event.type === 'tick' && Date.now() > lastTickTime + 250) {
				update(event.time).catch(error => console.error(error));
			}
		});
	},
};
