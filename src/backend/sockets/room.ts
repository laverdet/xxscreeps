import type { Effect } from 'xxscreeps/utility/types';
import type { Shard } from 'xxscreeps/engine/db';
import type { Room } from 'xxscreeps/game/room';
import type { SubscriptionEndpoint } from '../socket';
import config from 'xxscreeps/config';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/db/user';
import { runOneShot } from 'xxscreeps/game';
import { acquire, makeEventPublisher, mustNotReject } from 'xxscreeps/utility/async';
import { asUnion, getOrSet, throttle } from 'xxscreeps/utility/utility';
import { Render, roomSocketHandlers } from 'xxscreeps/backend/symbols';
import { getRoomChannel } from 'xxscreeps/engine/processor/model';
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

type RoomListener = (room: Room, time: number, didUpdate: boolean) => void;
type RoomState = {
	room: Room;
	time: number;
};
const globalSubscriptionsByRoom = new Map<string, Promise<{ listen: (fn: RoomListener) => Effect; state: RoomState }>>();

/**
 * Listen for updates to a room. Some work is shared between multiple listeners. If game time is
 * updated without any change to the room the listener is invoked with `room` === `undefined`.
 */
export async function subscribeToRoom(shard: Shard, roomName: string, listener: RoomListener) {
	const { listen, state } = await getOrSet(globalSubscriptionsByRoom, roomName, async() => {
		// Initialize current state
		let { time } = shard;
		let didUpdate = false;
		const state = {
			room: await shard.loadRoom(roomName, time, true),
			time,
		};

		// Set up publisher
		const { listen, publish } = makeEventPublisher<Parameters<RoomListener>>(() => effect());
		const timer = throttle(() => {
			if (state.time === time) {
				return;
			}
			mustNotReject(async() => {
				if (didUpdate) {
					state.room = await shard.loadRoom(roomName, time);
				}
				state.time = time;
				publish(state.room, time, didUpdate);
				didUpdate = false;
				timer.set(config.backend.socketThrottle);
			});
		});

		// Listen for game state
		const [ effect ] = await acquire(
			// Listen for game time updates
			shard.channel.listen(event => {
				if (event.type === 'tick') {
					time = event.time;
					timer.set(0);
				}
			}),
			// Listen for room updates
			getRoomChannel(shard, roomName).listen(event => {
				if (event.type === 'didUpdate') {
					// This happens before the tick is totally done
					didUpdate = true;
				}
			}),
			() => {
				// Clean up this publisher
				globalSubscriptionsByRoom.delete(roomName);
				// Disable pending listen timeout
				timer.clear();
			},
		);
		return { listen, state };
	});
	listener(state.room, state.time, true);
	return listen(listener);
}

export const roomSubscription: SubscriptionEndpoint = {
	pattern: /^room:(?:(?<shard>[A-Za-z0-9]+)\/)?(?<room>[A-Z0-9]+)$/,

	async subscribe(parameters) {
		let previous: any;
		let previousTime = -1;
		let skipUntil = 0;
		const { shard } = this.context;
		const seenUsers = new Set<string>();

		// Resolve room socket handlers
		const [ hookEffect, hookResults ] = await acquire(...roomSocketHandlers.map(fn => fn(shard, this.user, parameters.room)));
		const hooks = [ ...Fn.filter(hookResults) ];

		// Listen for room updates. Must be done after hooks are resolved because `update` will call hooks.
		const [ effect ] = await acquire(
			subscribeToRoom(shard, parameters.room, (room, time, didUpdate) => mustNotReject(async() => {
				if (Date.now() < skipUntil) {
					return;
				}

				// Invoke room socket handlers
				const extra = await Promise.all(hooks.map(fn => fn(time)));

				// Render current room state
				room['#initialize']();
				const visibleUsers = new Set<string>();
				const dval = didUpdate ? runOneShot(this.context.world, room, time, this.user ?? '0', () => {
					// Render all RoomObjects
					const objects: any = {};
					for (const object of room['#objects']) {
						asUnion(object);
						const value = object[Render](previousTime === -1 ? undefined : previousTime);
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
				}) : {};

				// Get users not yet seen
				const users = Fn.fromEntries(await Promise.all(Fn.map(visibleUsers, async(id): Promise<[ string, any ]> => {
					const info = await shard.db.data.hmget(User.infoKey(id), [ 'badge', 'username' ]);
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
				previousTime = time;
			})),

			getRoomChannel(shard, parameters.room).listen(event => {
				if (event.type === 'willSpawn') {
					// There is a race condition in the client where if you send an update while placing your
					// initial spawn the renderer will break until next refresh. It happens because the client
					// unsubscribes and immediately resubscribes to the channel. Since channels are only
					// addressed by the name of the channel messages from the old subscription will be sent to
					// the new handlers. Shut down event for a full second when someone is spawning in the
					// current room to avoid this condition.
					skipUntil = Date.now() + 1000;
				}
			}),

			() => hookEffect,
		);

		// Disconnect on socket hangup
		return effect;
	},
};
