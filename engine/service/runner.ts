import os from 'os';
import config from '~/engine/config';
import * as Code from '~/engine/metadata/code';
import * as User from '~/engine/metadata/user';
import { loadTerrainFromWorld, readWorld } from '~/game/map';
import { loadTerrain } from '~/driver/path-finder';
import { createSandbox, Sandbox } from '~/driver/sandbox';
import * as FlagIntents from '~/engine/processor/intents/flag';
import * as FlagSchema from '~/engine/schema/flag';
import { exchange, mapInPlace, filterInPlace } from '~/lib/utility';
import * as Storage from '~/storage';
import { Channel, Subscription } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { RunnerMessage } from '.';

export type UserIntent = { id: string; intent: string; room: string };
export type RunnerUserMessage =
	{ type: 'eval'; expr: string } |
	{ type: 'flag'; intent: FlagIntents.OneIntent } |
	{ type: 'push'; id: string; name: string } |
	({ type: 'intent' } & UserIntent) |
	{ type: null };

type PlayerInstance = {
	branch: string;
	codeChannel: Subscription<RunnerUserMessage>;
	consoleEval?: string[];
	flagsBlob: Readonly<Uint8Array> | undefined;
	flagsOutOfDate: boolean;
	sandbox?: Sandbox;
	stale: boolean;
	roomsVisible: Set<string>;
	userFlagIntents?: FlagIntents.OneIntent[];
	userIntents?: UserIntent[];
	writeConsole: (fd: number, payload: string, evalResult?: boolean) => void;
};

export default async function() {

	// Connect to main & storage
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
							const [ codeChannel, [ flagsBlob ], userBlob ] = await Promise.all([
								new Channel<RunnerUserMessage>(storage, `user/${userId}/runner`).subscribe(),
								// TODO: remove nested array hack after the typescript bug is fixed
								Promise.all([ persistence.get(`user/${userId}/flags`).catch(() => undefined) ]),
								persistence.get(`user/${userId}/info`),
							]);
							const user = User.read(userBlob);

							// Set up player instance information
							const instance: PlayerInstance = {
								branch: user.code.branch,
								codeChannel,
								flagsBlob,
								flagsOutOfDate: true,
								stale: false,
								roomsVisible: user.roomsVisible,
								writeConsole(fd, payload, evalResult?) {
									new Channel<Code.ConsoleMessage>(storage, `user/${userId}/console`)
										.publish({ type: 'console', [evalResult ? 'result' : 'log']: payload })
										.catch(console.error);
								},
							};

							// Listen for various messages to the runner
							codeChannel.listen(message => {
								if (message.type === 'eval') {
									if (!instance.consoleEval) {
										instance.consoleEval = [];
									}
									instance.consoleEval.push(message.expr);

								} else if (message.type === 'flag') {
									const intents = instance.userFlagIntents ?? (instance.userFlagIntents = []);
									intents.push(message.intent);

								} else if (message.type === 'push') {
									instance.branch = message.id;
									instance.stale = true;

								} else if (message.type === 'intent') {
									const intents = instance.userIntents ?? (instance.userIntents = []);
									intents.push(message);
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
										// TODO: delete this undefined hack for TS types
										persistence.get(`memory/${userId}`).catch(() => undefined as any as Readonly<Uint8Array>),
									]);
									instance.sandbox = await createSandbox({ userId, codeBlob, memoryBlob, terrain, writeConsole: instance.writeConsole });
								}
								return instance.sandbox;
							}(),
						]);

						// Run user code
						const result = await async function() {
							try {
								const flagsOutOfDate = exchange(instance, 'flagsOutOfDate', false);
								return await sandbox.run({
									time: gameTime,
									flagsBlob: flagsOutOfDate ? instance.flagsBlob : undefined,
									roomBlobs,
									consoleEval: exchange(instance, 'consoleEval'),
									userIntents: exchange(instance, 'userIntents'),
								});
							} catch (err) {
								console.error(err.stack);
								return { flagIntents: undefined, intentBlobs: {} };
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
								if (result.flagIntents || instance.userFlagIntents) {
									const flags = instance.flagsBlob ? FlagSchema.read(instance.flagsBlob) : {};
									if (result.flagIntents) {
										FlagIntents.execute(flags, result.flagIntents);
									}
									if (instance.userFlagIntents) {
										instance.flagsOutOfDate = true;
										const userFlagIntents = exchange(instance, 'userFlagIntents')!;
										const intents: FlagIntents.Parameters = {
											create: [],
											remove: [],
										};
										for (const intent of userFlagIntents) {
											if (intent.create) {
												intents.create.push(intent.create);
											}
											if (intent.remove) {
												intents.remove.push(intent.remove);
											}
										}
										FlagIntents.execute(flags, intents);
									}
									instance.flagsBlob = FlagSchema.write(flags);
									await persistence.set(`user/${userId}/flags`, instance.flagsBlob);
									await new Channel<FlagIntents.UserFlagMessage>(storage, `user/${userId}/flags`).publish({ type: 'updated' });
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
			instance.codeChannel.disconnect();
			instance.sandbox?.dispose();
		}
		storage.disconnect();
		runnerChannel.disconnect();
	}
}
