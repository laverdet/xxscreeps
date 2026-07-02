import type { RunnerIntent } from './model.js';
import type { Sandbox } from 'xxscreeps/driver/sandbox/index.js';
import type { SubscriptionFor } from 'xxscreeps/engine/db/channel.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { InitializationPayload, TickPayload, TickResult } from 'xxscreeps/engine/runner/index.js';
import type { World } from 'xxscreeps/game/map.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import { config } from 'xxscreeps/config/index.js';
import { createSandbox } from 'xxscreeps/driver/sandbox/index.js';
import * as RoomSchema from 'xxscreeps/engine/db/room.js';
import * as Code from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { publishRunnerIntentsForRooms, publishRunnerNamedIntents } from 'xxscreeps/engine/processor/model.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { acquireHookEffects } from 'xxscreeps/utility/hook.js';
import { clamp, disposableToEffect } from 'xxscreeps/utility/utility.js';
import { getAckChannel, getRunnerUserChannel, getUsageChannel } from './model.js';
import { hooks } from './symbols.js';

const acquireConnectors = function(invoke) {
	return async (instance: PlayerInstance) => {
		using disposable = new DisposableStack();
		const connectors = await acquireHookEffects(disposable, invoke(instance));
		const initialize = [ ...Fn.filter(Fn.map(connectors, hook => hook.initialize)) ];
		const refresh = [ ...Fn.filter(Fn.map(connectors, hook => hook.refresh)) ];
		const save = [ ...Fn.filter(Fn.map(connectors, hook => hook.save)) ].reverse();
		const effect = disposableToEffect(disposable.move());
		return [ () => effect(), {
			initialize: (payload: InitializationPayload) => Fn.mapAwait(initialize, fn => fn(payload)),
			refresh: (payload: TickPayload) => Fn.mapAwait(refresh, fn => fn(payload)),
			save: (payload: TickResult) => Fn.mapAwait(save, fn => fn(payload)),
		} ] as const;
	};
}(hooks.makeMapped('runnerConnector'));
const kCPU = 100;

export class PlayerInstance {
	readonly shard;
	readonly world;
	readonly userId;
	readonly username;
	private bucket = config.runner.cpu.bucket;
	private branchName;
	private cleanup!: Effect;
	private connectors!: typeof acquireConnectors extends (...args: any[]) =>
		Promise<readonly [ any, infer Type ]> ? Type : never;

	private sandbox: Sandbox | undefined;
	private stale = false;
	private readonly channel;
	private readonly codeChannel;
	private readonly consoleEval: Exclude<TickPayload['eval'], undefined> = [];
	private readonly consoleChannel;
	private readonly intents: RunnerIntent[] = [];
	private readonly seenUsers = new Set<string>();
	private readonly usageChannel;

	private constructor(
		shard: Shard,
		world: World,
		channel: SubscriptionFor<typeof getRunnerUserChannel>,
		codeChannel: SubscriptionFor<typeof Code['getUserCodeChannel']>,
		userId: string,
		username: string,
		branchName: string | null,
	) {
		this.shard = shard;
		this.world = world;
		this.channel = channel;
		this.codeChannel = codeChannel;
		this.userId = userId;
		this.username = username;
		this.branchName = branchName;
		this.consoleChannel = getConsoleChannel(this.shard, this.userId);
		this.usageChannel = getUsageChannel(this.shard, this.userId);

		// Listen for game interactions from user
		channel.listen(message => {
			switch (message.type) {
				case 'eval':
					this.consoleEval.push(message.payload);
					break;

				case 'intent': {
					this.intents.push(message.intent);
					break;
				}

				default:
			}
		});

		// Listen for code updates
		codeChannel.listen(message => {
			switch (message.type) {
				case 'switch':
					this.branchName = message.branch;
					this.stale = true;
					break;

				case 'update':
					if (this.branchName === message.branch) {
						this.stale = true;
					}
					break;

				default:
			}
		});
	}

	static async create(shard: Shard, world: World, userId: string) {
		// Connect to channel, load initial user data
		const [ channel, codeChannel, userInfo ] = await Promise.all([
			getRunnerUserChannel(shard, userId).subscribe(),
			Code.getUserCodeChannel(shard.db, userId).subscribe(),
			shard.db.data.hmGet(User.infoKey(userId), [ 'branch', 'username' ]),
		]);
		const instance = new PlayerInstance(shard, world, channel, codeChannel, userId, userInfo.username!, userInfo.branch ?? null);
		try {
			[ instance.cleanup, instance.connectors ] = await acquireConnectors(instance);
			return instance;
		} catch (err) {
			instance.disconnect();
			throw err;
		}
	}

	disconnect() {
		this.channel.disconnect();
		this.codeChannel.disconnect();
		mustNotReject(this.sandbox?.dispose());
		this.cleanup();
	}

	async run(this: PlayerInstance, time: number, visibleRooms: string[], intentRooms: string[]) {
		const result = await (async () => {
			// Dispose the current sandbox if the user has pushed new code
			const wasStale = this.stale;
			if (wasStale) {
				this.reset();
			}

			// If there's no sandbox load the required data and initialize
			if (!this.sandbox) {
				const payload: InitializationPayload = {
					userId: this.userId,
					shardName: this.shard.name,
					terrainBlob: this.world.terrainBlob,
				} as never;
				const [ codeBlob ] = await Promise.all([
					this.branchName == null ? undefined : Code.loadBlobs(this.shard.db, this.userId, this.branchName),
					this.connectors.initialize(payload),
				]);
				payload.codeBlob = codeBlob;
				this.sandbox = await createSandbox(this.userId, payload);
			}

			// Skip the tick if this reset was the player's fault
			if (wasStale) {
				return;
			}

			// Run the tick
			try {
				const bucket = Math.floor(this.bucket);
				const payload: Partial<TickPayload> = {
					backendIntents: this.intents.splice(0),
					eval: this.consoleEval.splice(0),
					cpu: {
						bucket,
						limit: kCPU,
						tickLimit: Math.min(config.runner.cpu.tickLimit, bucket),
					},
					time,
				};
				// This means `processor.intentAbandonTimeout` is too fast for `runner.cpu.tickLimit` *
				// `runner.concurrency` * active players * runner services. The user must be hard reset in
				// this case because we don't know if their loop has been setup.
				if (time !== this.shard.time) {
					throw new Error(`User '${this.username}' has been left behind`);
				}

				// Load room blobs and run mod connectors concurrently; both can contribute users to
				// resolve (rooms via `#users`, connectors via `payload.userIds`).
				const [ roomBlobs ] = await Promise.all([
					Promise.all(Fn.map(visibleRooms, roomName => this.shard.loadRoomBlob(roomName, time))),
					this.connectors.refresh(payload as TickPayload),
				]);
				payload.roomBlobs = roomBlobs;
				// Resolve usernames for users newly seen this tick: those present in visible rooms plus
				// any a connector requested.
				const newUserIds = Fn.pipe(
					roomBlobs,
					$$ => Fn.transform($$, blob => {
						const users = RoomSchema.read(blob)['#users'];
						return Fn.concat([ users.presence, users.extra ]);
					}),
					$$ => Fn.concat([ $$, payload.userIds ?? [] ]),
					$$ => new Set($$),
					$$ => Fn.reject($$, userId => this.seenUsers.has(userId)),
				);
				const entries = await Fn.mapAwait(newUserIds, async userId => {
					this.seenUsers.add(userId);
					const username = await this.shard.db.data.hGet(User.infoKey(userId), 'username');
					return [ userId, username! ] as const;
				});
				if (entries.length !== 0) {
					payload.usernames = Fn.fromEntries(entries);
				}
				// Send payload off to runtime and execute user code
				return await this.sandbox.run(payload as TickPayload);
			} catch (err: any) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				console.error(err.stack);
			}
		})();

		// Save runtime results
		if (result?.result === 'success') {
			const { payload } = result;
			const tickCpu = payload.usage.cpu ?? NaN;
			this.bucket = clamp(0, config.runner.cpu.bucket, this.bucket - tickCpu + kCPU);
			await Promise.all([
				// Publish intent blobs
				publishRunnerIntentsForRooms(this.shard, this.userId, time, intentRooms, payload.intentPayloads),

				// Publish named intent blobs
				payload.namedIntents && publishRunnerNamedIntents(this.shard, this.userId, time, payload.namedIntents),

				// Publish usage event
				this.usageChannel.publish(payload.usage),

				// Publish console
				payload.console == null ? undefined : this.consoleChannel.publish(payload.console),
				payload.evalAck && Fn.mapAwait(payload.evalAck, ack => getAckChannel(this.shard, this.userId).publish(ack)),

				// Save driver connector information [memory, flags, visual, whatever]
				this.connectors.save(payload),
			]);
		} else {
			if (result) {
				// Severe error, user loses a tick
				this.stale = true;
			} else {
				// Internal error, user resets immediately. CPU bucket refund should also go here. The error
				// has been logged above.
				this.reset();
			}
			const tasks: Promise<void>[] = [];
			if (result) {
				// Deduct CPU limit in case of severe failure
				this.bucket = clamp(0, config.runner.cpu.bucket, this.bucket - config.runner.cpu.tickLimit) + kCPU;
				tasks.push(this.usageChannel.publish({ cpu: kCPU }));

				if (result.result === 'disposed') {
					tasks.push(this.consoleChannel.publish(JSON.stringify([ {
						fd: 2,
						data: 'Script was disposed',
					} ])));

				} else if (result.result === 'timedOut') {
					tasks.push(this.consoleChannel.publish(JSON.stringify([ {
						fd: 2,
						data: `Script timed out${result.stack == null ? '' : `; ${result.stack}`}`,
					} ])));
				}
			}
			// Publish empty results to move processing along
			tasks.push(publishRunnerIntentsForRooms(this.shard, this.userId, time, intentRooms, {}));
			await Promise.all(tasks);
		}
	}

	private reset() {
		mustNotReject(this.sandbox?.dispose());
		this.sandbox = undefined;
		this.seenUsers.clear();
		this.stale = false;
	}
}
