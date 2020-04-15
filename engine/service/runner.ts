import os from 'os';
import config from '~/engine/config';
import * as Code from '~/engine/metadata/code';
import * as User from '~/engine/metadata/user';
import { loadUserFlagBlob, saveUserFlagBlobForNextTick } from '~/engine/model/user';
import { Shard } from '~/engine/model/shard';
import { loadTerrainFromWorld, readWorld } from '~/game/map';
import { loadTerrain } from '~/driver/path-finder';
import { createSandbox, Sandbox } from '~/driver/sandbox';
import { getRunnerUserChannel, RunnerIntent, RunnerUserMessage } from '~/engine/runner/channel';
import { exchange, mapInPlace, filterInPlace } from '~/lib/utility';
import * as Storage from '~/storage';
import { Channel, Subscription } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { RunnerMessage } from '.';

type PlayerInstance = {
	branch: string;
	channel: Subscription<RunnerUserMessage>;
	consoleEval?: string[];
	flagBlob: Readonly<Uint8Array> | undefined;
	intents?: RunnerIntent[];
	sandbox?: Sandbox;
	stale: boolean;
	roomsVisible: Set<string>;
	writeConsole: (fd: number, payload: string, evalResult?: boolean) => void;
};

export default async function() {

	// Connect to main & storage
	const shard = await Shard.connect('shard0');
	const storage = await Storage.connect('shard0');
	const { persistence } = storage;
	const usersQueue = Queue.connect(storage, 'runnerUsers');
	const runnerChannel = await new Channel<RunnerMessage>(storage, 'runner').subscribe();
	const concurrency = config.runner?.unsafeSandbox ? 1 :
		config.runner?.concurrency ?? (os.cpus().length >> 1) + 1;

	// Load shared terrain data
	const terrain = await persistence.get('terrain');
	const world = readWorld(terrain);
	loadTerrain(world); // pathfinder
	loadTerrainFromWorld(world); // game

	// Persistent player instances
	const playerInstances = new Map<string, PlayerInstance>();

	// Start the runner loop
	let gameTime = -1;
	await runnerChannel.publish({ type: 'runnerConnected' });
	try {
		for await (const message of runnerChannel) {

			if (message.type === 'shutdown') {
				break;

			} else if (message.type === 'processUsers') {
				const roomBlobCache = new Map<string, Readonly<Uint8Array>>();
				gameTime = message.time;
				usersQueue.version(`${gameTime}`);
				await Promise.all(Array(concurrency).fill(undefined).map(async() => {
					for await (const userId of usersQueue) {
						const instance = await async function() {
							// Get existing instance
							const current = playerInstances.get(userId);
							if (current) {
								return current;
							}

							// Connect to channel, load user
							const [ channel, flagBlob, userBlob ] = await Promise.all([
								getRunnerUserChannel(shard, userId).subscribe(),
								loadUserFlagBlob(shard, userId),
								persistence.get(`user/${userId}/info`),
							]);
							const user = User.read(userBlob);

							// Set up player instance information
							const instance: PlayerInstance = {
								branch: user.code.branch,
								channel,
								flagBlob,
								stale: false,
								roomsVisible: user.roomsVisible,
								writeConsole(fd, payload, evalResult?) {
									new Channel<Code.ConsoleMessage>(storage, `user/${userId}/console`)
										.publish({ type: 'console', [evalResult ? 'result' : 'log']: payload })
										.catch(console.error);
								},
							};

							// Listen for various messages to the runner
							channel.listen(message => {
								switch (message.type) {
									case 'code':
										instance.branch = message.id;
										instance.stale = true;
										break;

									case 'eval':
										if (!instance.consoleEval) {
											instance.consoleEval = [];
										}
										instance.consoleEval.push(message.expr);
										break;

									case 'intent': {
										const intents = instance.intents ?? (instance.intents = []);
										intents.push(message.intent);
										break;
									}

									default:
								}
							});

							playerInstances.set(userId, instance);
							return instance;
						}();

						const [ roomBlobs, sandbox ] = await Promise.all([
							// Load visible rooms for this user
							Promise.all(mapInPlace(instance.roomsVisible, async roomName =>
								roomBlobCache.get(roomName) ?? persistence.get(`room/${roomName}`).then(blob => {
									roomBlobCache.set(roomName, blob);
									return blob;
								}),
							)),

							// Load sandbox
							async function() {
								if (instance.stale) {
									instance.sandbox!.dispose();
									instance.sandbox = undefined;
								}
								if (!instance.sandbox) {
									const [ codeBlob, memoryBlob ] = await Promise.all([
										persistence.get(`user/${userId}/${instance.branch}`),
										persistence.get(`memory/${userId}`).catch(() => undefined),
									]);
									instance.sandbox = await createSandbox({ userId, codeBlob, flagBlob: instance.flagBlob, memoryBlob, terrain, writeConsole: instance.writeConsole });
								}
								return instance.sandbox;
							}(),
						]);

						// Run user code
						const result = await async function() {
							try {
								return await sandbox.run({
									time: gameTime,
									roomBlobs,
									consoleEval: exchange(instance, 'consoleEval'),
									userIntents: exchange(instance, 'intents'),
								});
							} catch (err) {
								console.error(err.stack);
								return { flagBlob: undefined, intentBlobs: {} };
							}
						}();

						const [ savedRoomNames ] = await Promise.all([
							// Save intent blobs
							mapInPlace(Object.entries(result.intentBlobs), async([ roomName, intents ]) => {
								if (instance.roomsVisible.has(roomName)) {
									await persistence.set(`intents/${roomName}/${userId}`, new Uint8Array(intents!));
									return roomName;
								} else {
									console.error(`Runtime sent intent for non-visible room. User: ${userId}; Room: ${roomName}; Tick: ${gameTime}`);
								}
							}),

							// Save flags
							async function() {
								if (result.flagBlob) {
									// TODO: Maybe some kind of sanity check on the blob since it was generated by a
									// runner?
									await saveUserFlagBlobForNextTick(shard, userId, result.flagBlob);
								}
							}(),

							// Save memory
							('memory' in result ? persistence.set(`memory/${userId}`, result.memory) : undefined),
						]);
						const roomNames = [ ...filterInPlace(await Promise.all(savedRoomNames)) ];
						await runnerChannel.publish({ type: 'processedUser', userId, roomNames });
					}
				}));
			}
		}

	} finally {
		for (const instance of playerInstances.values()) {
			instance.channel.disconnect();
			instance.sandbox?.dispose();
		}
		storage.disconnect();
		runnerChannel.disconnect();
	}
}
