import * as Room from '~/engine/schema/room';
import * as User from '~/engine/metadata/user';
import { runAsUser } from '~/game/context';
import { SubscriptionEndpoint } from '../socket';
import { Render } from './render';
import { mapInPlace, mapToKeys } from '~/lib/utility';

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

	async subscribe(parameters) {
		let lastTickTime = 0;
		let previous: any;
		const seenUsers = new Set<string>();
		const update = async(time: number) => {
			lastTickTime = Date.now();
			const roomBlob = await this.context.blobStorage.load(`ticks/${time}/${parameters.room}`);
			const room = Room.read(roomBlob);

			// Render current room state
			const objects: any = {};
			const visibleUsers = new Set<string>();
			runAsUser(this.user, time, () => {
				for (const object of room._objects) {
					const value = (object as any)[Render]?.(time);
					if (value !== undefined) {
						objects[value._id] = value;
					}
					const owner = object._owner;
					if (owner !== undefined && !seenUsers.has(owner)) {
						visibleUsers.add(owner);
					}
				}
			});

			// Get users not yet seen
			const users = mapToKeys(await Promise.all(mapInPlace(visibleUsers, async(id): Promise<[ string, any ]> => {
				const user = User.read(await this.context.blobStorage.load(`user/${id}/info`));
				return [ user.id, {
					username: user.username,
					badge: JSON.parse(user.badge),
				} ];
			})));

			// Diff with previous room state and return response
			const dval = diff(previous, objects);
			const response: any = {
				objects: dval,
				info: { mode: 'world' },
				gameTime: time,
				users,
			};
			this.send(JSON.stringify(response));
			previous = objects;
		};
		await update(this.context.time);
		return this.context.gameChannel.listen(event => {
			if (event.type === 'tick' && Date.now() > lastTickTime + 50) {
				update(event.time).catch(error => console.error(error));
			}
		});
	},
};
