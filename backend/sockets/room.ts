import { readRoom } from '~/engine/schema';
import { Objects } from '~/game/room';
import { SubscriptionEndpoint } from '../socket';
import { Render } from './render';

function diff(previous: any, next: any) {
	if (previous === next) {
		return;
	}
	if (previous === undefined || typeof previous !== typeof next) {
		return (next === undefined || next === null) ? null : next;
	}
	if (typeof previous === 'object') {
		const result: any = {};
		let didAdd = false;
		for (const key of new Set([ ...Object.keys(previous), ...Object.keys(next) ])) {
			const dval = diff(previous[key], next[key]);
			if (dval !== undefined) {
				result[key] = dval;
				didAdd = true;
			}
		}
		return didAdd ? result : undefined;
	}
	return next;
}

export const roomSubscription: SubscriptionEndpoint = {
	pattern: /^room:(?<room>[A-Z0-9]+)$/,

	subscribe(parameters) {
		let lastTickTime = 0;
		let previous: any;
		const update = async(time: number) => {
			lastTickTime = Date.now();
			const roomBlob = await this.context.blobStorage.load(`ticks/${time}/${parameters.room}`);
			const room = readRoom(roomBlob);
			// Render current room state
			const objects: any = {};
			for (const object of room[Objects]) {
				const value = (object as any)[Render]?.();
				if (value !== undefined) {
					objects[value._id] = value;
				}
			}
			// Diff with previous room state and return response
			const dval = diff(previous, objects);
			const response: any = {
				objects: dval,
				info: { mode: 'world' },
				users: {
					'123': {
						username: 'test',
						badge: {},
					},
				},
			};
			this.send(JSON.stringify(diff(previous, response)));
			previous = objects;
		};
		return this.context.mainChannel.listen(event => {
			if (event.type === 'tick' && Date.now() > lastTickTime + 50) {
				update(event.time).catch(error => console.error(error));
			}
		});
	},
};
