import type { RoomObject } from './object.js';
import type { Room } from './room/index.js';
import type { IntentParameters, IntentReceivers, IntentsForReceiver } from 'xxscreeps/engine/processor/index.js';
import type { ObjectReceivers, RoomIntentPayload } from 'xxscreeps/engine/processor/room.js';
import type { Dictionary } from 'xxscreeps/utility/types.js';
import * as BufferObject from 'xxscreeps/schema/buffer-object.js';
import * as C from './constants/index.js';

const kCpuCost = 0.2;
// Receivers addressed by a global name instead of a room or object: every registered intent whose
// receiver is neither a `RoomObject` nor a `Room` (e.g. `market`), applied per-user outside the room
// processor.
type NamedReceivers = Exclude<IntentReceivers, RoomObject | Room>;
// Wire/storage form: receiver → intent → one arg-tuple per `pushNamed` call. The arg-tuples stay
// untyped at the storage layer, like the room-intent payloads (`RoomIntentPayload`).
type NamedIntent = Partial<Record<IntentsForReceiver<NamedReceivers>, any[][]>>;
export type NamedIntentPayload = Partial<Record<NamedReceivers, NamedIntent>>;

export class IntentManager {
	cpu = 0;
	intentsByName: NamedIntentPayload = {};
	intentsByRoom: Dictionary<RoomIntentPayload> = {};

	getIntentsForRoom(roomName: string) {
		return this.intentsByRoom[roomName];
	}

	getNamedIntents() {
		return this.intentsByName;
	}

	/**
	 * Save an intent for a globally-scoped name, like "flag.create" or "market.createOrder".
	 */
	pushNamed<
		Receiver extends NamedReceivers,
		Action extends IntentsForReceiver<Receiver>,
	>(receiver: Receiver, intent: Action, ...args: IntentParameters<Receiver, Action>) {
		const forName: NamedIntent = this.intentsByName[receiver] ??= {};
		const intents = forName[intent as keyof typeof forName] ??= [];
		this.cpu += kCpuCost;
		intents.push(args);
		return C.OK;
	}

	/**
	 * Save a unique intent for a RoomObject in an active room
	 */
	save<
		Receiver extends ObjectReceivers,
		Action extends IntentsForReceiver<any>,
		//Action extends IntentsForReceiver<Receiver>,
	>(receiver: Receiver, intent: Action, ...args: IntentParameters<Receiver, Action>) {
		if (!BufferObject.check(receiver)) {
			throw new Error(`Could not find an object with ID ${receiver.id}`);
		}
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
