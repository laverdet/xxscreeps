import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/metadata/user';
import { getObjects } from 'xxscreeps/game/room/methods';
import { getFlagChannel, loadVisuals, loadUserFlags } from 'xxscreeps/engine/model/user';
import { runAsUser, runWithState } from 'xxscreeps/game';
import { Variant } from 'xxscreeps/schema';
import { SubscriptionEndpoint } from '../socket';
import { acquire } from 'xxscreeps/utility/async';
import { stringifyInherited } from 'xxscreeps/utility/string';
import { asUnion, merge } from 'xxscreeps/utility/utility';
import { eventRenderers, Render } from 'xxscreeps/backend/symbols';
import './render';

function diff(previous: any, next: any) {
	if (previous === next) {
		return;
	}
	if (previous == null || next == null || typeof previous !== typeof next) {
		return (next == null) ? null : next;
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
		let flagsStale = true;
		let flagString = '';
		let visualsString = '';
		let lastTickTime = 0;
		let previous: any;
		const seenUsers = new Set<string>();

		const update = async(time: number) => {
			lastTickTime = Date.now();
			const [ room ] = await Promise.all([
				// Update room objects
				this.context.shard.loadRoom(parameters.room, time),
				// Update user flags
				(async() => {
					if (this.user && flagsStale) {
						flagsStale = false;
						const flags = await loadUserFlags(this.context.shard, this.user);
						const flagsInThisRoom = Object.values(flags).filter(flag => flag.pos.roomName === parameters.room);
						flagString = flagsInThisRoom.map(
							flag => `${flag.name}~${flag.color}~${flag.secondaryColor}~${flag.pos.x}~${flag.pos.y}`).join('|');
					}
				})(),
				// Update visuals
				(async() => {
					if (!this.user) {
						return;
					}
					const allVisuals = await loadVisuals(this.context.shard, this.user, time);
					visualsString = '';
					if (allVisuals) {
						const visuals = allVisuals.find(visual => visual.name === parameters.room);
						if (visuals) {
							for (const visual of visuals.visual) {
								(visual as any).t = visual[Variant];
								visualsString += stringifyInherited(visual) + '\n';
							}
						}
					}
				})(),
			]);

			// Render current room state
			const objects: any = {};
			const visibleUsers = new Set<string>();
			runAsUser(this.user ?? '0', () => {
				runWithState([ room ], time, () => {
					// Objects
					for (const object of getObjects(room)) {
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

					// Events
					for (const event of room.getEventLog()) {
						const hooks = eventRenderers.get(event.event);
						for (const hook of hooks ?? []) {
							const result = hook(event, room);
							if (result) {
								// Filter rendered targets that are no longer visible
								for (const key in result) {
									if (!(key in objects)) {
										delete result[key];
									}
								}
								// Merge event into rendered tree
								merge(objects, result);
							}
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
			const response: any = {
				objects: dval,
				flags: flagString,
				visual: visualsString,
				info: { mode: 'world' },
				gameTime: time,
				users,
			};
			this.send(JSON.stringify(response));
			previous = objects;
		};

		// Listen for updates
		const [ effect ] = await acquire(
			// Room updates
			this.context.shard.channel.listen(event => {
				if (event.type === 'tick' && Date.now() > lastTickTime + 50) {
					update(event.time).catch(error => console.error(error));
				}
			}),
			// Flag updates
			this.user ? getFlagChannel(this.context.shard, this.user).listen(event => {
				if (event.type === 'updated') {
					flagsStale = true;
				}
			}) : undefined,
		);

		// Fire off first update immediately
		await update(this.context.shard.time);

		// Disconnect on socket hangup
		return effect;
	},
};
