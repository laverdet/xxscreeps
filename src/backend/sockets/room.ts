import type { SubscriptionEndpoint } from '../socket';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/metadata/user';
import { Objects } from 'xxscreeps/game/room';
import { GameState, runAsUser, runWithState } from 'xxscreeps/game';
import { acquire } from 'xxscreeps/utility/async';
import { asUnion } from 'xxscreeps/utility/utility';
import { Render, roomSocketHandlers } from 'xxscreeps/backend/symbols';
import './render';

function diff(previous: any, next: any) {
	if (previous === next) {
		return;
	}
	if (previous == null || next == null || typeof previous !== typeof next) {
		return next == null ? null : next;
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
	pattern: /^room:(?:(?<shard>[A-Za-z0-9]+)\/)?(?<room>[A-Z0-9]+)$/,

	async subscribe(parameters) {
		let lastTickTime = 0;
		let previous: any;
		const seenUsers = new Set<string>();

		const update = async(time: number) => {
			lastTickTime = Date.now();
			const [ room, extra ] = await Promise.all([
				// Update room objects
				this.context.shard.loadRoom(parameters.room, time),
				// Invoke room socket handlers
				Promise.all(hooks.map(fn => fn(time))),
			]);

			// Render current room state
			const objects: any = {};
			const visibleUsers = new Set<string>();
			runWithState(new GameState(this.context.world, time, [ room ]), () => {
				runAsUser(this.user ?? '0', () => {
					// Objects
					for (const object of room[Objects]) {
						asUnion(object);
						const value = object[Render]();
						if (value) {
							if (value._id) {
								objects[value._id] = value;
							}
						}
						const owner = object.owner;
						if (owner != null && !seenUsers.has(owner)) {
							seenUsers.add(owner);
							visibleUsers.add(owner);
						}
					}
				});
			});

			// Get users not yet seen
			const users = Fn.fromEntries(await Promise.all(Fn.map(visibleUsers, async(id): Promise<[ string, any ]> => {
				const user = User.read(await this.context.shard.blob.reqBuffer(`user/${id}/info`));
				return [ user.id, {
					username: user.username,
					badge: JSON.parse(user.badge),
				} ];
			})));

			// Diff with previous room state and return response
			const dval = diff(previous, objects);
			const response = Object.assign({
				objects: dval,
				info: { mode: 'world' },
				gameTime: time,
				users,
			}, ...extra);
			this.send(JSON.stringify(response));
			previous = objects;
		};

		// Listen for updates
		const [ effect, [ hookResults ] ] = await acquire(
			// Resolve room socket handlers
			acquire(...roomSocketHandlers.map(fn => fn(this.context.shard, this.user, parameters.room))),
			// Room updates
			this.context.shard.channel.listen(event => {
				if (event.type === 'tick' && Date.now() > lastTickTime + 50) {
					update(event.time).catch(error => console.error(error));
				}
			}),
		);
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const hooks = hookResults.filter(hook => hook);

		// Fire off first update immediately
		await update(this.context.shard.time);

		// Disconnect on socket hangup
		return effect;
	},
};
