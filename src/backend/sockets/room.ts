import type { SubscriptionEndpoint } from '../socket';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/user/user';
import { GameState, runAsUser, runWithState } from 'xxscreeps/game';
import { acquire } from 'xxscreeps/utility/async';
import { asUnion } from 'xxscreeps/utility/utility';
import { Render, roomSocketHandlers } from 'xxscreeps/backend/symbols';
import './render';
import { getRoomChannel } from 'xxscreeps/engine/processor/model';

const kUpdateInterval = 125;

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

function throttle(fn: () => void) {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let disabled = 0;
	return {
		clear() {
			if (timeout) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		},
		disable() {
			this.clear();
			++disabled;
		},
		enable() {
			--disabled;
		},
		reset(time: number) {
			if (disabled === 0) {
				this.clear();
				this.set(time);
			}
		},
		set(time: number) {
			if (!timeout && disabled === 0) {
				timeout = setTimeout(fn, time);
			}
		},
	};
}

export const roomSubscription: SubscriptionEndpoint = {
	pattern: /^room:(?:(?<shard>[A-Za-z0-9]+)\/)?(?<room>[A-Z0-9]+)$/,

	async subscribe(parameters) {
		let previous: any;
		let didUpdate = true;
		let time = -1;
		let previousTime = -1;
		const seenUsers = new Set<string>();
		const timer = throttle(() => { update().catch(console.error) });

		const update = async() => {
			if (time === previousTime) {
				return;
			}
			previousTime = time;
			timer.disable();
			const [ room, extra ] = await Promise.all([
				// Update room objects
				didUpdate ? this.context.shard.loadRoom(parameters.room, time) : undefined,
				// Invoke room socket handlers
				Promise.all(hooks.map(fn => fn(time))),
			]);
			didUpdate = false;

			// Render current room state
			const visibleUsers = new Set<string>();
			const dval = room ? runWithState(new GameState(this.context.world, time, [ room ]), () =>
				runAsUser(this.user ?? '0', () => {
					// Render all RoomObjects
					const objects: any = {};
					for (const object of room['#objects']) {
						asUnion(object);
						const value = object[Render]();
						if (value) {
							if (value._id) {
								objects[value._id] = value;
							}
						}
						const owner = object['#user'];
						if (owner != null && !seenUsers.has(owner)) {
							seenUsers.add(owner);
							visibleUsers.add(owner);
						}
						for (const userId of object['#extraUsers']) {
							if (!seenUsers.has(userId)) {
								seenUsers.add(userId);
								visibleUsers.add(userId);
							}
						}
					}
					// Diff with previous payload
					const dval = diff(previous, objects);
					previous = objects;
					return dval;
				})) : {};

			// Get users not yet seen
			const users = Fn.fromEntries(await Promise.all(Fn.map(visibleUsers, async(id): Promise<[ string, any ]> => {
				const info = await this.context.shard.db.data.hmget(User.infoKey(id), [ 'badge', 'username' ]);
				return [ id, {
					username: info.username,
					badge: info.badge ? JSON.parse(info.badge) : {},
				} ];
			})));
			visibleUsers.clear();

			// Diff with previous room state and return response
			const response = Object.assign({
				objects: dval,
				info: { mode: 'world' },
				gameTime: time,
				users,
			}, ...extra);
			this.send(JSON.stringify(response));
			timer.enable();
			timer.set(kUpdateInterval);
		};

		// Listen for updates
		const [ effect, [ hookResults ] ] = await acquire(
			// Resolve room socket handlers
			acquire(...roomSocketHandlers.map(fn => fn(this.context.shard, this.user, parameters.room))),
			// Listen for shard time update
			this.context.shard.channel.listen(event => {
				if (event.type === 'tick') {
					time = event.time;
					timer.set(0);
				}
			}),
			// Listen for room updates
			getRoomChannel(this.context.shard, parameters.room).listen(event => {
				if (event.type === 'didUpdate') {
					// This happens before the tick is totally done
					didUpdate = true;
				} else if (event.type === 'willSpawn') {
					// There is a race condition in the client where if you send an update while placing your
					// initial spawn the renderer will break until next refresh. It happens because the client
					// unsubscribes and immediately resubscribes to the channel. Since channels are only
					// addressed by the name of the channel messages from the old subscription will be sent to
					// the new handlers. Shut down event for a full second when someone is spawning in the
					// current room to avoid this condition.
					timer.reset(500);
				}
			}),
			// Disable updates on unlisten
			() => () => { timer.clear(); timer.disable() },
		);
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const hooks = hookResults.filter(hook => hook);

		// Fire off first update immediately
		try {
			time = this.context.shard.time;
			await update();
		} catch (err) {
			effect();
			throw err;
		}

		// Disconnect on socket hangup
		return effect;
	},
};
