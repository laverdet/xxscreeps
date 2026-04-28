import type { RoomObject } from './object.js';
import type { Room } from './room/index.js';
import type { IntentParameters, IntentReceivers, IntentsForReceiver } from 'xxscreeps/engine/processor/index.js';
import type { ObjectReceivers, RoomIntentPayload } from 'xxscreeps/engine/processor/room.js';
import type { Dictionary } from 'xxscreeps/utility/types.js';
import * as C from './constants/index.js';

const kCpuCost = 0.2;
type NamedReceivers = Exclude<IntentReceivers, RoomObject | Room>;
type NamedIntent = Partial<Record<IntentsForReceiver<NamedReceivers>, any[]>>;
type NamedIntentPayload = Partial<Record<NamedReceivers, NamedIntent>>;

export type UserIntentPayload = Record<string, any[][]>;

export class IntentManager {
	cpu = 0;
	intentsByName: NamedIntentPayload = {};
	intentsByRoom: Dictionary<RoomIntentPayload> = {};
	intentsByUser: UserIntentPayload = {};

	getIntentsForName(name: NamedReceivers) {
		return this.intentsByName[name];
	}

	getIntentsForRoom(roomName: string) {
		return this.intentsByRoom[roomName];
	}

	getIntentsForUser() {
		return this.intentsByUser;
	}

	/**
	 * Push a user-scoped intent (no room or object receiver), with a per-tick cap on the named
	 * bucket. Mirrors vanilla's `intents.push(name, data, maxLen)` semantics: returns OK on accept,
	 * ERR_FULL once the bucket reaches `maxLen`. The 21st call to a 20-cap bucket is rejected.
	 */
	pushUser(intent: string, args: any[], maxLen: number) {
		const list = this.intentsByUser[intent] ??= [];
		if (list.length >= maxLen) {
			return C.ERR_FULL;
		}
		list.push(args);
		this.cpu += kCpuCost;
		return C.OK;
	}

	/**
	 * Save an intent for a globally-scoped name, like "flag.create" or "market.createOrder".
	 */
	/*
	pushNamed<
		Receiver extends NamedReceivers,
		Action extends IntentsForReceiver<Receiver>
	>(receiver: Receiver, intent: Action, ...args: IntentParameters<Receiver, Action>) {
		const forName = this.intentsByName[receiver] ??= {} as never;
		const intents = forName[intent] ??= [] as never;
		this.cpu += kCpuCost;
		intents.push(args);
		return C.OK;
	}
	*/

	/**
	 * Save a unique intent for a RoomObject in an active room
	 */
	save<
		Receiver extends ObjectReceivers,
		Action extends IntentsForReceiver<any>,
		//Action extends IntentsForReceiver<Receiver>,
	>(receiver: Receiver, intent: Action, ...args: IntentParameters<Receiver, Action>) {
		const intents = this.makeIntentsForRoom(receiver.room.name).object[receiver.id] ??= {};
		if (intents[intent as keyof typeof intents] === undefined) {
			this.cpu += kCpuCost;
		}
		intents[intent as keyof typeof intents] = args;
		return C.OK;
	}

	/**
	 * Remove an issued intent
	 */
	remove<
		Receiver extends ObjectReceivers,
		Action extends IntentsForReceiver<any>,
	>(receiver: Receiver, intent: Action) {
		const intents = this.intentsByRoom[receiver.room.name]?.object[receiver.id];
		if (intents?.[intent as keyof typeof intents]) {
			this.cpu -= kCpuCost;
			delete intents[intent as keyof typeof intents];
			return C.OK;
		}
		return C.ERR_NOT_FOUND;
	}

	/**
	 * Save a local room intent.. I think this is literally only "createConstructionSite".
	 */
	pushLocal<
		Action extends IntentsForReceiver<Room>,
	>(room: Room, intent: Action, ...args: IntentParameters<Room, Action>) {
		const intents = this.makeIntentsForRoom(room.name).local[intent] ??= [] as never;
		this.cpu += kCpuCost;
		intents.push(args);
		return C.OK;
	}

	private makeIntentsForRoom(roomName: string) {
		return this.intentsByRoom[roomName] ??= {
			local: {},
			object: {},
		};
	}
}
