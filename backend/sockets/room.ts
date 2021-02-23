import * as Room from 'xxscreeps/engine/schema/room';
import * as User from 'xxscreeps/engine/metadata/user';
import type { RoomObject } from 'xxscreeps/game/objects/room-object';
import { getFlagChannel, loadUserFlags } from 'xxscreeps/engine/model/user';
import { runAsUser } from 'xxscreeps/game/game';
import { SubscriptionEndpoint } from '../socket';
import { acquire, mapInPlace, mapToKeys } from 'xxscreeps/util/utility';

// Register a room renderer on a `RoomObject` type
const Render = Symbol('render');
type RenderedRoomObject = {
	_id: string;
	type: string;
	x: number;
	y: number;
};
declare module 'xxscreeps/game/objects/room-object' {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface RoomObject {
		[Render]?: (this: RoomObject, object: RoomObject) => RenderedRoomObject;
	}
}
export function bindRenderer<Type extends RoomObject>(impl: { prototype: Type }, renderer: (this: Type, object: Type) => RenderedRoomObject) {
	impl.prototype[Render] = renderer;
}

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
		let flagsStale = true;
		let flagString = '';
		let lastTickTime = 0;
		let previous: any;
		const seenUsers = new Set<string>();

		const update = async(time: number) => {
			lastTickTime = Date.now();
			const [ room ] = await Promise.all([
				// Update room objects
				(async() => {
					const roomBlob = await this.context.persistence.get(`room/${parameters.room}`);
					return Room.read(roomBlob);
				})(),
				// Update user flags
				(async() => {
					if (flagsStale) {
						flagsStale = false;
						const flags = await loadUserFlags(this.context.shard, this.user);
						const flagsInThisRoom = Object.values(flags).filter(flag => flag.pos.roomName === parameters.room);
						flagString = flagsInThisRoom.map(
							flag => `${flag.name}~${flag.color}~${flag.secondaryColor}~${flag.pos.x}~${flag.pos.y}`).join('|');
					}
				})(),
			]);

			// Render current room state
			const objects: any = {};
			const visibleUsers = new Set<string>();
			runAsUser(this.user, time, () => {
				for (const object of room._objects) {
					const value = object[Render]?.(object);
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
				const user = User.read(await this.context.persistence.get(`user/${id}/info`));
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
			this.context.gameChannel.listen(event => {
				if (event.type === 'tick' && Date.now() > lastTickTime + 50) {
					update(event.time).catch(error => console.error(error));
				}
			}),
			// Flag updates
			getFlagChannel(this.context.shard, this.user).listen(event => {
				if (event.type === 'updated') {
					flagsStale = true;
				}
			}),
		);

		// Fire off first update immediately
		await update(this.context.time);

		// Disconnect on socket hangup
		return effect;
	},
};
