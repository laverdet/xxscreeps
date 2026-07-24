import type { IntentParameters, IntentReceivers, IntentsForReceiver } from './index.js';
import type { RoomTickProcessor } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import { acquireFinalIntentsForRoom, activeRoomsKey, publishInterRoomIntents, roomDidProcess, sleepRoomUntil, updateUserRoomRelationships } from 'xxscreeps/engine/processor/model.js';
import * as Movement from 'xxscreeps/engine/processor/movement.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game, GameState, me, runAsUser, runWithState } from 'xxscreeps/game/index.js';
import { flushUsers } from 'xxscreeps/game/room/room.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { PreTick, Tick, hooks, intentProcessorGetters, roomTickProcessors } from './symbols.js';

// Register per-tick per-room processor
export function registerRoomTickProcessor(tick: RoomTickProcessor) {
	roomTickProcessors.push(tick);
}

export type ObjectReceivers = Extract<IntentReceivers, RoomObject>;
type ObjectIntent = Partial<Record<IntentsForReceiver<ObjectReceivers>, unknown[]>>;
export interface RoomIntentPayload {
	local: Partial<Record<IntentsForReceiver<Room>, unknown[][]>>;
	object: Partial<Record<string, ObjectIntent>>;
	internal?: true;
}
export interface SingleIntent {
	intent: string;
	args: unknown[];
}
interface ProcessorTask {
	promise: Promise<unknown>;
	userId: string;
	finalize: ((result: unknown) => void) | undefined;
}

const flushContext = hooks.makeIterated('flushContext');

export interface ProcessorContext {
	readonly shard: Shard;
	readonly state: GameState;

	/**
	 * Invoke this from a processor when game state has been modified in a processor
	 */
	didUpdate: () => void;

	/**
	 * Requests processor next tick, and also sets updated flag.
	 */
	setActive: () => void;

	/**
	 * Request a process tick at a given time. The default is to sleep forever if there are no intents
	 * to process.
	 */
	wakeAt: (time: number) => void;

	/**
	 * Attribute a gameplay statistic to a user's activity in this room. Implemented by a stats mod;
	 * without one this is `undefined` and contributions are dropped.
	 */
	incrementRoomStat?: (userId: string | null | undefined, stat: string, amount: number) => void;

	/**
	 * Send an intent to another room
	 */
	sendRoomIntent: <Intent extends IntentsForReceiver<Room>>(
		roomName: string, intent: Intent, ...params: IntentParameters<Room, Intent>) => void;

	/**
	 * Run an asynchronous task with an optional finalization process with the result when it's done.
	 * This must not be invoked during the finalization phase.
	 */
	task: <Type>(task: Promise<Type>, finalize?: (result: Type) => void) => void;
}

// Room processor context saved been phase 1 (process) and phase 2 (flush)
export class RoomProcessor implements ProcessorContext {
	nextUpdate = Infinity;
	readonly room;
	readonly shard;
	readonly state: GameState;
	readonly time;
	readonly nextTime;
	receivedUpdate = false;

	private tasks: ProcessorTask[] = [];

	private readonly intents = new Map<string, RoomIntentPayload>();
	private readonly interRoomIntents = new Map<string, SingleIntent[]>();

	constructor(shard: Shard, world: World, room: Room, time: number) {
		this.shard = shard;
		this.room = room;
		this.time = time;
		this.nextTime = time + 1;
		this.state = new GameState(world, this.nextTime, [ room ]);
	}

	async process(isFinalization = false) {
		this.receivedUpdate = false;
		this.nextUpdate = Infinity;

		runWithState(this.state, () => {
			// Reset eventLog for this tick
			this.room['#eventLog'] = [];

			// Pre-intent processor
			const objects = this.room['#objects'];
			{
				const { length } = objects;
				for (let ii = 0; ii < length; ++ii) {
					// Iterated manually to avoid including newly-pushed `now` objects
					const object = objects[ii]!;
					invokeHandler(object, PreTick, this);
				}
			}
			this.room['#flushObjects'](this.state);

			// Run `registerRoomTickProcessor` hooks
			for (const process of roomTickProcessors) {
				process(this.room, this);
			}
			this.room['#flushObjects'](this.state);

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
							const entries = Fn.pipe(
								Object.entries(objectIntents[id]!),
								$$ => Fn.map($$, ([ intent, args ]) => ({
									intent,
									args,
									processor: intentProcessorGetters.get(intent)?.(object),
								})),
								$$ => Fn.filter($$, info => info.processor),
								$$ => [ ...$$ ]);
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
			this.room['#flushObjects'](this.state);

			// Post-intent processor
			Movement.dispatch(this.room);
			{
				const { length } = objects;
				for (let ii = 0; ii < length; ++ii) {
					// Iterated manually to avoid including newly-pushed `now` objects
					const object = objects[ii]!;
					invokeHandler(object, Tick, this);
				}
			}
			this.room['#flushObjects'](this.state);
		});

		// Run async tasks
		await this.flushTasks();

		// Publish results
		if (!isFinalization) {
			await Promise.all(Fn.map(this.interRoomIntents, ([ roomName, intents ]) =>
				publishInterRoomIntents(this.shard, roomName, this.time, intents)));
			await roomDidProcess(this.shard, this.time);
		}
		flushContext();
	}

	async finalize(didWake: boolean) {
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
		this.room['#flushObjects'](this.state);
		const previousUsers = flushUsers(this.room);
		const hasNoPlayers = Fn.every(this.room['#users'].intents, userId => userId.length <= 2);
		flushContext();

		await Promise.all([
			// Update room to user map
			updateUserRoomRelationships(this.shard, this.room, previousUsers),
			// Save updated room blob
			this.receivedUpdate
				? this.shard.saveRoom(this.room.name, this.nextTime, this.room) :
				this.shard.copyRoomFromPreviousTick(this.room.name, this.nextTime),
			// Update room processor status
			hasNoPlayers && didWake && this.nextUpdate === this.nextTime &&
				// Room was woken this tick by an inter-room intent, and will remain active
				this.shard.scratch.zAdd(activeRoomsKey, [ [ 0, this.room.name ] ]),
		]);
		// Update room processor status
		if (hasNoPlayers && this.nextUpdate !== this.nextTime) {
			// Mark inactive if needed. Must be *after* saving room, because this copies from current tick.
			return sleepRoomUntil(this.shard, this.room.name, this.nextTime, this.nextUpdate - 1);
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
					...existing.object[id],
					...intents,
				};
			}
		} else {
			this.intents.set(user, intentsForUser);
		}
	}

	sendRoomIntent(roomName: string, intent: string, ...args: any[]) {
		if (this.state.world.map.getRoomStatus(roomName, true)) {
			getOrSet(this.interRoomIntents, roomName, () => []).push({ intent, args });
		}
	}

	didUpdate() {
		this.receivedUpdate = true;
	}

	setActive() {
		this.didUpdate();
		this.wakeAt(this.nextTime);
	}

	task<Type>(promise: Promise<Type>, finalize?: (result: any) => void) {
		this.tasks.push({ promise, finalize, userId: me });
	}

	wakeAt(time: number) {
		if (time !== 0) {
			if (time < this.nextTime) {
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

	private finalizeTaskBatch(tasks: ProcessorTask[], results: unknown[]) {
		if (tasks.length !== results.length) {
			throw new Error('Tasks queued out of processor context');
		}
		const tasksByUser = Fn.groupBy(tasks.entries(), ([ ii, task ]) => [ task.userId, ii ]);
		for (const [ userId, indices ] of tasksByUser) {
			if (indices.some(ii => tasks[ii]?.finalize)) {
				runAsUser(userId, () => {
					for (const ii of indices) {
						tasks[ii]?.finalize?.(results[ii]);
					}
				});
			}
		}
	}
}

function invokeHandler(object: RoomObject, key: typeof PreTick | typeof Tick, context: ProcessorContext) {
	const invokeFrom = (implementation: RoomObject) => {
		for (
			let prototype: RoomObject | null = implementation;
			prototype;
			prototype = Object.getPrototypeOf(prototype) as RoomObject | null
		) {
			const fn = prototype[key];
			if (fn && Object.hasOwn(prototype, key)) {
				fn.call(object, object, context, () => invokeFrom(Object.getPrototypeOf(prototype) as RoomObject));
			}
		}
	};
	invokeFrom(object);
}
