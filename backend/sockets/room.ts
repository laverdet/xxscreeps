import { readRoom } from '~/game/schema';
import { Objects } from '~/game/room';
import { SubscriptionEndpoint } from '../socket';
import { Render } from './render';

export const roomSubscription: SubscriptionEndpoint = {
	pattern: /^room:(?<room>[A-Z0-9]+)$/,

	subscribe(parameters) {
		let lastTickTime = 0;
		const update = async(time: number) => {
			lastTickTime = Date.now();
			const roomBlob = await this.context.blobStorage.load(`ticks/${time}/${parameters.room}`);
			const room = readRoom(roomBlob);
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
			this.send(JSON.stringify(response));
		};
		return this.context.mainChannel.listen(event => {
			if (event.type === 'tick' && Date.now() > lastTickTime + 50) {
				update(event.time).catch(error => console.error(error));
			}
		});
	},
};
