import type { Effect } from 'xxscreeps/utility/types';
import type { InitializationPayload, TickPayload } from 'xxscreeps/driver';
import type { Sandbox } from 'xxscreeps/driver/sandbox';
import type { DriverConnector } from 'xxscreeps/driver/symbols';
import type { RunnerIntent } from './model';
import type { Shard } from 'xxscreeps/engine/db';
import type { SubscriptionFor } from 'xxscreeps/engine/db/channel';
import type { World } from 'xxscreeps/game/map';
import config from 'xxscreeps/config';
import * as Code from 'xxscreeps/engine/db/user/code';
import * as Fn from 'xxscreeps/utility/functional';
import * as RoomSchema from 'xxscreeps/engine/db/room';
import * as User from 'xxscreeps/engine/db/user';
import { getRunnerUserChannel, getUsageChannel } from './model';
import { acquire } from 'xxscreeps/utility/async';
import { createSandbox } from 'xxscreeps/driver/sandbox';
import { driverConnectors } from 'xxscreeps/driver/symbols';
import { publishRunnerIntentsForRoom } from 'xxscreeps/engine/processor/model';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model';
import { clamp } from 'xxscreeps/utility/utility';

const kCPU = 100;

export class PlayerInstance {
	private bucket = config.runner.cpu.bucket;
	private cleanup!: Effect;
	private connectors!: DriverConnector[];
	private sandbox?: Sandbox;
	private stale = false;
	private readonly consoleEval: Exclude<TickPayload['eval'], undefined> = [];
	private readonly consoleChannel;
	private readonly intents: RunnerIntent[] = [];
	private readonly seenUsers = new Set<string>();
	private readonly usageChannel;

	private constructor(
		public readonly shard: Shard,
		private readonly world: World,
		private readonly channel: SubscriptionFor<typeof getRunnerUserChannel>,
		private readonly codeChannel: SubscriptionFor<typeof Code['getUserCodeChannel']>,
		public readonly userId: string,
		private readonly username: string,
		private branchName: string | null,
	) {
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
			shard.db.data.hmget(User.infoKey(userId), [ 'branch', 'username' ]),
		]);
		const instance = new PlayerInstance(shard, world, channel, codeChannel, userId, userInfo.username!, userInfo.branch);
		try {
			[ instance.cleanup, instance.connectors ] = await acquire(...driverConnectors.map(fn => fn(instance)));
			return instance;
		} catch (err) {
			instance.disconnect();
			throw err;
		}
	}

	disconnect() {
		this.channel.disconnect();
		this.codeChannel.disconnect();
		this.sandbox?.dispose();
		this.cleanup();
	}

	async run(this: PlayerInstance, time: number, roomNames: string[]) {
		const result = await (async() => {
			// Dispose the current sandbox if the user has pushed new code
			const wasStale = this.stale;
			if (wasStale) {
				this.sandbox!.dispose();
				this.sandbox = undefined;
				this.seenUsers.clear();
				this.stale = false;
			}

			// If there's no sandbox load the required data and initialize
			if (!this.sandbox) {
				const payload: InitializationPayload = {
					userId: this.userId,
					shardName: this.shard.name,
					terrainBlob: this.world.terrainBlob,
				} as never;
				const [ codeBlob ] = await Promise.all([
					this.branchName ? Code.loadBlobs(this.shard.db, this.userId, this.branchName) : null,
					Promise.all(this.connectors.map(connector => connector.initialize?.(payload))),
				]);
				if (!codeBlob) {
					console.error(`Unable to load code for user ${this.userId}`);
					return;
				}
				payload.codeBlob = codeBlob;
				this.sandbox = await createSandbox(payload, (fd, payload) => {
					const type = ([ 'result', 'log', 'error' ] as const)[fd];
					this.consoleChannel.publish({ type, value: payload }).catch(console.error);
				});
			}

			// Skip the tick if this reset was the player's fault
			if (wasStale) {
				return;
			}

			// Run the tick
			try {
				const payload: Partial<TickPayload> = {
					backendIntents: this.intents.splice(0),
					eval: this.consoleEval.splice(0),
					cpu: {
						bucket: this.bucket,
						limit: kCPU,
						tickLimit: Math.min(config.runner.cpu.tickLimit, this.bucket),
					},
					time,
				};
				await Promise.all([
					(async() => {
						// Load room blobs
						payload.roomBlobs = await Promise.all(Fn.map(roomNames,
							roomName => this.shard.loadRoomBlob(roomName, time - 1)));
						// Load unseen users
						const userIds = Fn.concat(Fn.map(payload.roomBlobs, blob => RoomSchema.read(blob)['#users'].presence));
						const newUserIds = Fn.reject(userIds, userId => this.seenUsers.has(userId));
						const entries: [ string, string ][] = await Promise.all(Fn.map(newUserIds, async userId => {
							this.seenUsers.add(userId);
							return [ userId, (await this.shard.db.data.hget(User.infoKey(userId), 'username'))! ];
						}));
						if (entries.length !== 0) {
							payload.usernames = Fn.fromEntries(entries);
						}
					})(),
					// Also run mod connectors
					Promise.all(Fn.map(this.connectors, connector => connector.refresh?.(payload as TickPayload))),
				]);
				// Send payload off to runtime and execute user code
				return await this.sandbox.run(payload as TickPayload);
			} catch (err) {
				console.error(err.stack);
				this.stale = true;
			}
		})();

		// Save runtime results
		if (result?.result === 'success') {
			const { payload } = result;
			this.bucket = clamp(0, config.runner.cpu.bucket, this.bucket - payload.usage.cpu + kCPU);
			await Promise.all([
				// Publish intent blobs
				Promise.all(Fn.map(roomNames, roomName =>
					publishRunnerIntentsForRoom(this.shard, this.userId, roomName, time, payload.intentPayloads[roomName]))),

				// Publish usage event
				this.usageChannel.publish(payload.usage),

				// Publish console acks
				payload.evalAck ? Promise.all(payload.evalAck.map(ack =>
					getConsoleChannel(this.shard, this.userId).publish({ type: 'ack', ...ack }),
				)) : undefined,

				// Save driver connector information [memory, flags, visual, whatever]
				Promise.all(Fn.map(this.connectors, connector => connector.save?.(payload))),
			]);
		} else {
			if (result) {
				// Deduct CPU limit in case of severe failure
				this.bucket = clamp(0, config.runner.cpu.bucket, this.bucket - config.runner.cpu.tickLimit) + kCPU;
				void this.usageChannel.publish({ cpu: kCPU });
				if (result.result === 'disposed') {
					void this.consoleChannel.publish({ type: 'error', value: 'Script was disposed' });
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				} else if (result.result === 'timedOut') {
					void this.consoleChannel.publish({ type: 'error', value: 'Script timed out' });
				}
			}
			// Publish empty results to move processing along
			await Promise.all(Fn.map(roomNames, roomName => publishRunnerIntentsForRoom(this.shard, this.userId, roomName, time)));
		}
	}
}
