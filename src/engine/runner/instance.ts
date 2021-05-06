import type { Effect } from 'xxscreeps/utility/types';
import type { InitializationPayload, TickPayload } from 'xxscreeps/driver';
import type { RunnerIntent, RunnerUserMessage } from './channel';
import type { Sandbox } from 'xxscreeps/driver/sandbox';
import type { DriverConnector } from 'xxscreeps/driver/symbols';
import type { Shard } from 'xxscreeps/engine/shard';
import type { Subscription } from 'xxscreeps/engine/storage/channel';
import type { World } from 'xxscreeps/game/map';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/metadata/user';
import { acquire } from 'xxscreeps/utility/async';
import { createSandbox } from 'xxscreeps/driver/sandbox';
import { driverConnectors } from 'xxscreeps/driver/symbols';
import { publishRunnerIntentsForRoom } from 'xxscreeps/engine/processor/model';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model';
import { getRunnerUserChannel } from './channel';

export class PlayerInstance {
	tickPayload: TickPayload = {} as never;
	readonly userId: string;
	private branch: string | null;
	private cleanup!: Effect;
	private connectors!: DriverConnector[];
	private sandbox?: Sandbox;
	private stale = false;
	private readonly consoleEval: string[] = [];
	private readonly consoleChannel: ReturnType<typeof getConsoleChannel>;
	private readonly intents: RunnerIntent[] = [];

	private constructor(
		user: User.User,
		public readonly shard: Shard,
		private readonly world: World,
		private readonly channel: Subscription<RunnerUserMessage>,
	) {
		this.branch = user.code.branch;
		this.userId = user.id;
		this.consoleChannel = getConsoleChannel(this.shard, this.userId);

		// Listen for various messages probably sent from backend
		channel.listen(message => {
			switch (message.type) {
				case 'code':
					this.branch = message.id;
					this.stale = true;
					break;

				case 'eval':
					this.consoleEval.push(message.expr);
					break;

				case 'intent': {
					this.intents.push(message.intent);
					break;
				}

				default:
			}
		});
	}

	static async create(shard: Shard, world: World, userId: string) {
		// Connect to channel, load initial user data
		const [ channel, userBlob ] = await Promise.all([
			getRunnerUserChannel(shard, userId).subscribe(),
			shard.blob.reqBuffer(`user/${userId}/info`),
		]);
		const user = User.read(userBlob);
		const instance = new PlayerInstance(user, shard, world, channel);
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
				this.stale = false;
			}

			// If there's no sandbox load the required data and initialize
			if (!this.sandbox) {
				const payload: InitializationPayload = {
					userId: this.userId,
					shardName: this.shard.name,
					terrainBlob: this.world.terrainBlob,
				} as never;
				[ payload.codeBlob ] = await Promise.all([
					this.shard.blob.reqBuffer(`user/${this.userId}/${this.branch}`),
					Promise.all(this.connectors.map(connector => connector.initialize?.(payload))),
				]);
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
				const payload: TickPayload = {
					time,
					consoleEval: this.consoleEval.splice(0),
					backendIntents: this.intents.splice(0),
				} as never;
				[ payload.roomBlobs ] = await Promise.all([
					Promise.all(Fn.map(roomNames, roomName => this.shard.loadRoomBlob(roomName, time - 1))),
					Promise.all(Fn.map(this.connectors, connector => connector.refresh?.(payload))),
				]);
				return await this.sandbox.run(payload);
			} catch (err) {
				console.error(err.stack);
				this.stale = true;
			}
		})();

		// Save runtime results
		if (result) {
			await Promise.all([
				// Publish intent blobs
				Promise.all(Fn.map(roomNames, roomName =>
					publishRunnerIntentsForRoom(this.shard, this.userId, roomName, time, result.intentPayloads[roomName]))),

				// Save driver connector information [memory, flags, visual, whatever]
				Promise.all(Fn.map(this.connectors, connector => connector.save?.(result))),
			]);
		} else {
			// Publish empty results to move processing along
			await Promise.all(Fn.map(roomNames, roomName => publishRunnerIntentsForRoom(this.shard, this.userId, roomName, time)));
		}
	}
}
