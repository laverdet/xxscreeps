import type { SubscriptionEndpoint } from '../socket.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import { hooks } from 'xxscreeps/backend/index.js';
import { Render } from 'xxscreeps/backend/symbols.js';
import { config } from 'xxscreeps/config/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getRoomChannel } from 'xxscreeps/engine/processor/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { runOneShot } from 'xxscreeps/game/index.js';
import { acquireWith, makeEventPublisher, mustNotReject } from 'xxscreeps/utility/async.js';
import { acquireHookEffects } from 'xxscreeps/utility/hook.js';
import { asUnion, disposableToEffect, getOrSet, throttle } from 'xxscreeps/utility/utility.js';
import './render.js';

function diff(previous: unknown, next: unknown): Record<string, unknown> | null | undefined {
	if (previous === next) {
		return;
	}
	if (previous == null || next == null || typeof previous !== typeof next) {
		return (next ?? null) satisfies object | null as Record<string, unknown> | null;
	}
	if (typeof previous === 'object') {
		const result: Record<string, unknown> = {};
		let didAdd = false;
		for (const key of new Set([ ...Object.keys(previous), ...Object.keys(next) ])) {
			// @ts-expect-error
			const dval = diff(previous[key], next[key]);
			if (dval !== undefined) {
				result[key] = dval;
				didAdd = true;
			}
		}
		return didAdd ? result : undefined;
	}
	return next satisfies object as Record<string, unknown>;
}

type RoomListener = (room: Room, time: number, didUpdate: boolean) => void;
type RoomState = {
	room: Room;
	time: number;
};
const globalSubscriptionsByRoom = new Map<string, Promise<{ listen: (fn: RoomListener) => Effect; state: RoomState }>>();
const invokeSocketHooks = hooks.makeMapped('roomSocket');

/**
 * Listen for updates to a room. Some work is shared between multiple listeners. If game time is
 * updated without any change to the room the listener is invoked with `room` === `undefined`.
 */
export async function subscribeToRoom(shard: Shard, roomName: string, listener: RoomListener): Promise<Effect> {
	const task = getOrSet(globalSubscriptionsByRoom, roomName, async () => {
		using disposable = new DisposableStack();

		// Initialize current state
		let { time } = shard;
		let didUpdate = false;
		const state = {
			room: await shard.loadRoom(roomName, time, true),
			time,
		};

		// Listen for room updates
		disposable.defer(await getRoomChannel(shard, roomName).listen(event => {
			if (event.type === 'didUpdate') {
				// This happens before the tick is totally done
				didUpdate = true;
			}
		}));

		// Listen for game time updates
		disposable.defer(shard.channel.listen(event => {
			if (event.type === 'tick') {
				time = event.time;
				timer.set(0);
			}
		}));

		// Clean up this publisher
		disposable.defer(() => globalSubscriptionsByRoom.delete(roomName));

		// Disable pending listen timeout
		disposable.defer(() => timer.clear());

		// Set up publisher
		const { listen, publish } =
			makeEventPublisher<Parameters<RoomListener>>(function(disposable) {
				return () => disposable.dispose();
			}(disposable.move()));
		const timer = throttle(() => {
			if (state.time === time) {
				return;
			}
			mustNotReject(async () => {
				// `time` is advanced by the tick channel during the `await loadRoom` below. Snapshot the
				// tick so the blob is rendered at its own tick, not a later one — otherwise decay fields
				// (e.g. rampart `#nextDecayTime`) read as overdue and throw `Invalid expiry time`.
				const renderTime = time;
				if (didUpdate) {
					state.room = await shard.loadRoom(roomName, renderTime);
				}
				state.time = renderTime;
				publish(state.room, renderTime, didUpdate);
				didUpdate = false;
				timer.set(config.backend.socketThrottle);
			});
		});

		return { listen, state };
	});

	const { listen, state } = await task;
	if (task === globalSubscriptionsByRoom.get(roomName)) {
		listener(state.room, state.time, true);
		return listen(listener);
	} else {
		// Avoid invoking `listen` on a dead event publisher
		return subscribeToRoom(shard, roomName, listener);
	}
}

export const roomSubscription: SubscriptionEndpoint = {
	pattern: /^room:(?:(?<shard>[A-Za-z0-9]+)\/)?(?<room>[A-Z0-9]+)$/,

	async subscribe(parameters) {
		let previous: any;
		let previousTime = -1;
		let skipUntil = 0;
		let missedUpdateDuringSkip = false;
		const { shard } = this.context;
		const seenUsers = new Set<string>();
		const roomName = parameters.room!;
		if (!this.context.world.map.getRoomStatus(roomName, true)) {
			return () => {};
		}

		// Resolve room socket handlers
		using disposable = new DisposableStack();
		const hookRunners = await acquireHookEffects(disposable, invokeSocketHooks(shard, this.user, roomName));

		// Listen for room updates. Must be done after hooks are resolved because `update` will call hooks.
		await acquireWith(
			fn => disposable.defer(fn),
			subscribeToRoom(shard, roomName, (room, time, didUpdate) => mustNotReject(async () => {
				if (Date.now() < skipUntil) {
					if (didUpdate) {
						missedUpdateDuringSkip = true;
					}
					return;
				}
				if (missedUpdateDuringSkip) {
					didUpdate = true;
					missedUpdateDuringSkip = false;
				}

				// Render current room state
				room['#initialize']();
				const visibleUsers = new Set<string>();
				const dval = didUpdate ? runOneShot(this.context.world, room, time, this.user ?? '0', () => {
					// Render all RoomObjects
					const objects: Record<string, unknown> = {};
					for (const object of room['#objects']) {
						asUnion(object);
						const value = object[Render](previousTime === -1 ? undefined : previousTime);
						if (value) {
							if (value._id) {
								objects[value._id] = value;
							}
						}
					}
					// Check for new users
					const users = room['#users'];
					for (const userId of Fn.concat<string>([ users.presence, users.extra ])) {
						if (!seenUsers.has(userId)) {
							seenUsers.add(userId);
							visibleUsers.add(userId);
						}
					}
					// Diff with previous payload
					const dval = diff(previous, objects);
					previous = objects;
					return dval;
				}) : {};

				const [ extra, users ] = await Promise.all([
					// Invoke room socket handlers
					Fn.mapAwait(hookRunners, fn => fn(time)),

					// Get users not yet seen
					async function() {
						const entries = await Fn.mapAwait(visibleUsers, async id => {
							const info = await shard.db.data.hmGet(User.infoKey(id), [ 'badge', 'username' ]);
							const rendered = {
								username: info.username,
								badge: info.badge == null ? {} : JSON.parse(info.badge) as unknown,
							};
							return [ id, rendered ] as const;
						});
						visibleUsers.clear();
						return Fn.fromEntries(entries);
					}(),
				]);

				// Diff with previous room state and return response
				const response: unknown = Object.assign(
					{
						objects: dval,
						info: { mode: 'world' },
						gameTime: time,
						users,
					},
					...extra,
				);
				this.send(JSON.stringify(response));
				previousTime = time;
			})),

			getRoomChannel(shard, roomName).listen(event => {
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
		);

		// Disconnect on socket hangup
		return disposableToEffect(disposable.move());
	},
};
