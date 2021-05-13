import type { RoomObject } from 'xxscreeps/game/object';
import type { Shard } from 'xxscreeps/engine/shard';
import type { World } from 'xxscreeps/game/map';
import type { IntentParameters, IntentReceivers, IntentsForReceiver } from '.';
import type { Room } from 'xxscreeps/game/room';
import type { RoomTickProcessor } from './symbols';
import * as Fn from 'xxscreeps/utility/functional';
import * as Movement from 'xxscreeps/engine/processor/movement';
import { Game, GameState, runAsUser, runWithState } from 'xxscreeps/game';
import { getUsersInRoom } from 'xxscreeps/game/room/room';
import { PreTick, Processors, Tick, roomTickProcessors } from './symbols';

import 'xxscreeps/config/mods/import/game';
import 'xxscreeps/config/mods/import/processor';
import { acquireFinalIntentsForRoom, publishInterRoomIntents, roomDidProcess, sleepRoomUntil, updateUserRoomRelationships } from 'xxscreeps/engine/processor/model';
import { getOrSet } from 'xxscreeps/utility/utility';

// Register per-tick per-room processor
export function registerRoomTickProcessor(tick: RoomTickProcessor) {
	roomTickProcessors.push(tick);
}

export type ObjectReceivers = Extract<IntentReceivers, RoomObject>;
type ObjectIntent = Partial<Record<IntentsForReceiver<ObjectReceivers>, any>>;
export type RoomIntentPayload = {
	local: Partial<Record<IntentsForReceiver<Room>, any[]>>;
	object: Partial<Record<string, ObjectIntent>>;
};
export type SingleIntent = {
	intent: string;
	args: any[];
};

export interface ObjectProcessorContext {
	/**
	 * Invoke this from a processor when game state has been modified in a processor
	 */
	didUpdate(): void;

	/**
	 * Requests processor next tick, and also sets updated flag.
	 */
	setActive(): void;

	/**
	 * Request a process tick at a given time. The default is to sleep forever if there are no intents
	 * to process.
	 */
	wakeAt(time: number): void;

	/**
	 * Send an intent to another room
	 */
	sendRoomIntent<Intent extends IntentsForReceiver<Room>>(
		roomName: string, intent: Intent, ...params: IntentParameters<Room, Intent>): void;
}

// Room processor context saved been phase 1 (process) and phase 2 (flush)
export class RoomProcessorContext implements ObjectProcessorContext {
	receivedUpdate = false;
	nextUpdate = Infinity;
	readonly state: GameState;
	private readonly intents = new Map<string, RoomIntentPayload>();
	private readonly interRoomIntents = new Map<string, SingleIntent[]>();

	constructor(
		private readonly shard: Shard,
		world: World,
		public readonly room: Room,
		public readonly time: number,
	) {
		this.state = new GameState(world, time, [ room ]);
	}

	async process(isFinalization = false) {
		this.receivedUpdate = false;
		this.nextUpdate = Infinity;

		runWithState(this.state, () => {
			// Reset eventLog for this tick
			this.room['#eventLog'] = [];

			// Pre-intent processor
			for (const object of this.room['#objects']) {
				object[PreTick]?.(object, this);
			}
			this.room['#flushObjects']();

			// Run `registerRoomTickProcessor` hooks
			for (const process of roomTickProcessors) {
				process(this.room, this);
			}
			this.room['#flushObjects']();

			// Process user intents
			for (const [ user, intents ] of this.intents) {
				runAsUser(user, () => {

					// Process intents for room (createConstructionSite)
					const roomIntents = intents.local;
					const processors = this.room[Processors]!;
					for (const intent in roomIntents) {
						const processor = processors[intent];
						if (processor) {
							for (const args of roomIntents[intent as keyof typeof roomIntents]!) {
								processor(this.room, this, ...args);
							}
						}
					}

					// Process intents for room objects
					const objectIntents = intents.object;
					for (const id in objectIntents) {
						const object = Game.getObjectById(id);
						if (object) {
							for (const [ intent, args ] of Object.entries(objectIntents[id]!)) {
								object[Processors]![intent]?.(object, this, ...args);
							}
						}
					}
				});
			}
			this.room['#flushObjects']();

			// Post-intent processor
			Movement.dispatch(this.room);
			for (const object of this.room['#objects']) {
				object[Tick]?.(object, this);
			}
			this.room['#flushObjects']();
		});

		// Publish results
		if (!isFinalization) {
			await Promise.all(Fn.map(this.interRoomIntents, ([ roomName, intents ]) =>
				publishInterRoomIntents(this.shard, roomName, this.time, intents)));
			await roomDidProcess(this.shard, this.room.name, this.time);
		}
	}

	async finalize() {
		// Run inter-room intents
		const intentPayloads = await acquireFinalIntentsForRoom(this.shard, this.room.name, this.time);
		if (intentPayloads.length) {
			runWithState(this.state, () => {
				const processors = this.room[Processors]!;
				for (const intents of intentPayloads) {
					for (const { intent, args } of intents) {
						processors[intent]?.(this.room, this, ...args);
					}
				}
			});
		}
		this.room['#flushObjects']();

		const userIds = getUsersInRoom(this.room);
		await Promise.all([
			// Update room to user map
			updateUserRoomRelationships(this.shard, this.room.name, userIds),
			// Save updated room blob
			this.receivedUpdate ?
				this.shard.saveRoom(this.room.name, this.time, this.room) :
				this.shard.copyRoomFromPreviousTick(this.room.name, this.time),
		]);
		// Mark inactive if needed. Must be *after* saving room, because this copies from current
		// tick.
		if (userIds.size === 0 && this.nextUpdate !== this.time + 1) {
			return sleepRoomUntil(this.shard, this.room.name, this.time, this.nextUpdate);
		}
	}

	saveIntents(user: string, intentsForUser: RoomIntentPayload) {
		const existing = this.intents.get(user);
		if (existing) {
			for (const [ name, intents ] of Object.entries(intentsForUser.local)) {
				const key = name as keyof typeof existing.local;
				existing.local[key] = [
					...existing.local[key] ?? [],
					...intents!,
				];
			}
			for (const [ id, intents ] of Object.entries(intentsForUser.object)) {
				existing.object[id] = {
					...existing.object[id] ?? {},
					...intents,
				};
			}
		} else {
			this.intents.set(user, intentsForUser);
		}
	}

	sendRoomIntent(roomName: string, intent: string, ...args: any[]) {
		getOrSet(this.interRoomIntents, roomName, () => []).push({ intent, args });
	}

	didUpdate() {
		this.receivedUpdate = true;
	}

	setActive() {
		this.didUpdate();
		this.wakeAt(this.time + 1);
	}

	wakeAt(time: number) {
		if (time !== 0) {
			if (time < this.time + 1) {
				throw new Error('Invalid wake time');
			}
			this.nextUpdate = Math.min(time, this.nextUpdate);
		}
	}
}
