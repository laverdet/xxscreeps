import type { Dictionary } from 'xxscreeps/utility/types';
import type { Room } from 'xxscreeps/game/room';
import type { RoomObject } from 'xxscreeps/game/object';
import type { IntentsForReceiver, IntentParameters, IntentReceivers } from 'xxscreeps/processor';
import type { ObjectReceivers, RoomIntentPayload } from 'xxscreeps/processor/room';
import * as C from 'xxscreeps/game/constants';

const kCpuCost = 0.2;
type NamedReceivers = Exclude<IntentReceivers, RoomObject | Room>;

type NamedIntent = Partial<Record<IntentsForReceiver<NamedReceivers>, any[]>>;
type NamedIntentPayload = Partial<Record<NamedReceivers, NamedIntent>>;

export class IntentManager {
	cpu = 0;
	intentsByName: NamedIntentPayload = {};
	intentsByRoom: Dictionary<RoomIntentPayload> = {};

	getIntentsForName(name: NamedReceivers) {
		return this.intentsByName[name];
	}

	getIntentsForRoom(roomName: string) {
		return this.intentsByRoom[roomName];
	}

	/**
	 * Save an intent for a globally-scoped name, like "flag.create" or "market.createOrder".
	 */
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
	 * Save a local room intent.. I think this is literally only "createConstructionSite".
	 */
	pushLocal<
		Action extends IntentsForReceiver<Room>
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
