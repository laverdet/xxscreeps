import type { RoomObject } from 'xxscreeps/game/object';
import type { Shard } from 'xxscreeps/engine/db';
import type { World } from 'xxscreeps/game/map';
import type { IntentParameters, IntentReceivers, IntentsForReceiver } from '.';
import type { Room } from 'xxscreeps/game/room';
import type { RoomTickProcessor } from './symbols';
import * as Fn from 'xxscreeps/utility/functional';
import * as Movement from 'xxscreeps/engine/processor/movement';
import { Game, GameState, me, runAsUser, runWithState } from 'xxscreeps/game';
import { flushUsers } from 'xxscreeps/game/room/room';
import { PreTick, Tick, intentProcessorGetters, roomTickProcessors } from './symbols';
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
	internal?: true;
};
export type SingleIntent = {
	intent: string;
	args: any[];
};

export interface ProcessorContext {
	shard: Shard;

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

	/**
	 * Run an asynchronous task with an optional finalization process with the result when it's done.
	 * This must not be invoked during the finalization phase.
	 */
	task<Type>(task: Promise<Type>, finalize?: (result: Type) => void): void;
}

// Room processor context saved been phase 1 (process) and phase 2 (flush)
export class RoomProcessor implements ProcessorContext {
	receivedUpdate = false;
	nextUpdate = Infinity;
	readonly state: GameState;

	private tasks: {
		promise: Promise<any>;
		userId: string;
		finalize?: (result: any) => void;
	}[] = [];

	private readonly intents = new Map<string, RoomIntentPayload>();
	private readonly interRoomIntents = new Map<string, SingleIntent[]>();

	constructor(
		public readonly shard: Shard,
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
			const objects = this.room['#objects'];
			for (let length = objects.length, ii = 0; ii < length; ++ii) {
				// Iterated manually to avoid including newly-pushed `now` objects
				const object = objects[ii];
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
					for (const intent in roomIntents) {
						const processor = intentProcessorGetters.get(intent)?.(this.room);
						if (processor && (!processor.internal || intents.internal)) {
							for (const args of roomIntents[intent as keyof typeof roomIntents]!) {
								processor.process(this.room, this, ...args);
							}
						}
					}

					// Process intents for room objects
					const objectIntents = intents.object;
					for (const id in objectIntents) {
						const object = Game.getObjectById(id);
						if (object) {
							let mask = 0;
							const entries = [ ...Fn.filter(
								Fn.map(Object.entries(objectIntents[id]!), ([ intent, args ]) => ({
									intent,
									args,
									processor: intentProcessorGetters.get(intent)?.(object),
								})),
								info => info.processor) ];
							entries.sort((left, right) => left.processor!.priority - right.processor!.priority);
							for (const info of entries) {
								if (
									(!info.processor!.internal || intents.internal) &&
									(mask & info.processor!.mask) === 0
								) {
									mask |= info.processor!.mask;
									info.processor?.process(object, this, ...info.args);
								}
							}
						}
					}
				});
			}
			this.room['#flushObjects']();

			// Post-intent processor
			Movement.dispatch(this.room);
			for (let length = objects.length, ii = 0; ii < length; ++ii) {
				// Iterated manually to avoid including newly-pushed `now` objects
				const object = objects[ii];
				object[Tick]?.(object, this);
			}
			this.room['#flushObjects']();
			Movement.flush();
		});

		// Run async tasks
		await this.flushTasks();

		// Publish results
		if (!isFinalization) {
			await Promise.all(Fn.map(this.interRoomIntents, ([ roomName, intents ]) =>
				publishInterRoomIntents(this.shard, roomName, this.time, intents)));
			await roomDidProcess(this.shard, this.room.name, this.time);
		}
	}

	async finalize() {
		const [ intentPayloads, taskResults ] = await Promise.all([
			acquireFinalIntentsForRoom(this.shard, this.room.name),
			Promise.all(Fn.map(this.tasks, task => task.promise)),
		]);
		const hasTaskFinalization = this.tasks.some(task => task.finalize);
		if (intentPayloads.length || hasTaskFinalization) {
			runWithState(this.state, () => {
				// Run first batch of finalizations
				const tasks = this.tasks;
				this.tasks = [];
				this.finalizeTaskBatch(tasks, taskResults);

				// Run inter-room intents
				for (const intents of intentPayloads) {
					for (const { intent, args } of intents) {
						const processor = intentProcessorGetters.get(intent)?.(this.room);
						processor!.process(this.room, this, ...args);
					}
				}
			});
		}

		// Flush extra tasks
		await this.flushTasks();

		// Finalize room object
		this.room['#flushObjects']();
		const previousUsers = flushUsers(this.room);
		const hasPlayer = Fn.some(this.room['#users'].intents, userId => userId.length > 2);

		await Promise.all([
			// Update room to user map
			updateUserRoomRelationships(this.shard, this.room, previousUsers),
			// Save updated room blob
			this.receivedUpdate ?
				this.shard.saveRoom(this.room.name, this.time, this.room) :
				this.shard.copyRoomFromPreviousTick(this.room.name, this.time),
		]);
		// Mark inactive if needed. Must be *after* saving room, because this copies from current tick.
		if (!hasPlayer && this.nextUpdate !== this.time + 1) {
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
					...intents,
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

	task(promise: Promise<any>, finalize?: (result: any) => void) {
		this.tasks.push({ promise, finalize, userId: me });
	}

	wakeAt(time: number) {
		if (time !== 0) {
			if (time < this.time + 1) {
				throw new Error(`Invalid wake time ${time}; current ${this.time}`);
			}
			this.nextUpdate = Math.min(time, this.nextUpdate);
		}
	}

	private async flushTasks() {
		while (this.tasks.length) {
			const tasks = this.tasks;
			this.tasks = [];
			const results = await Promise.all(Fn.map(tasks, task => task.promise));
			if (tasks.some(task => task.finalize)) {
				runWithState(this.state, () => {
					this.finalizeTaskBatch(tasks, results);
				});
			}
		}
	}

	private finalizeTaskBatch(tasks: any[], results: any[]) {
		if (tasks.length !== results.length) {
			throw new Error('Tasks queued out of processor context');
		}
		const tasksByUser = Fn.groupBy(Fn.range(tasks.length), ii => tasks[ii].userId);
		for (const [ userId, indices ] of tasksByUser) {
			if (indices.some(ii => tasks[ii].finalize)) {
				runAsUser(userId, () => {
					for (const ii of indices) {
						tasks[ii].finalize?.(results[ii]);
					}
				});
			}
		}
	}
}
