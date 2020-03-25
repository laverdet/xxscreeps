import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { MainMessage } from '~/engine/service';
import { getReader } from '~/engine/schema';
import * as Schema from '~/engine/game/schema';
import { Objects } from '~/engine/game/room';
import { BufferView } from '~/engine/schema/buffer-view';
import { Subscription } from '../socket';
import { Render } from '../render';

const readRoom = getReader(Schema.schema.Room, Schema.interceptorSchema);

export const roomSubscription: Subscription = {
	pattern: /^room:(?<room>[A-Z0-9]+)$/,

	subscribe: async(connection, user, parameters) => {
		const blobStorage = await BlobStorage.connect();

		let lastTick = 0;
		const channel = await Channel.connect<MainMessage>('main');
		channel.listen(event => {
			(async function() {
				const now = Date.now();
				if (event.type === 'tick' && now > lastTick + 250) {
					lastTick = now;
					const roomBlob = await blobStorage.load(`ticks/${event.time}/${parameters.room}`);
					const room = readRoom(BufferView.fromTypedArray(roomBlob), 0);
					const response: any = {
						objects: {},
						info: { mode: 'world' },
						users: {
							'123': {
								username: 'test',
								badge: {},
							},
						},
					};
					for (const objects of room[Objects]) {
						const value = (objects as any)[Render]?.();
						if (value !== undefined) {
							response.objects[value._id] = value;
						}
					}
					connection.write(JSON.stringify([ `room:${parameters.room}`, response ]));
				}
			})().catch(error => console.error(error));
		});
		return () => {
			blobStorage.disconnect();
			channel.disconnect();
		};
	},
};
