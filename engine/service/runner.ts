import os from 'os';
import configPromise from '~/engine/config';
import * as Code from '~/engine/metadata/code';
import * as User from '~/engine/metadata/user';
import { loadTerrainFromWorld, readWorld } from '~/game/map';
import { loadTerrain } from '~/driver/path-finder';
import { createSandbox, Sandbox } from '~/driver/sandbox';
import { exchange, mapInPlace, filterInPlace } from '~/lib/utility';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { RunnerMessage } from '.';

type PlayerInstance = {
	branch: string;
	codeChannel: Channel<Code.Message>;
	consoleEval?: string[];
	sandbox?: Sandbox;
	stale: boolean;
	roomsVisible: Set<string>;
	writeConsole: (fd: number, payload: string, evalResult?: boolean) => void;
};

export default async function() {

	// Connect to main & storage
	const { config } = await configPromise;
	const blobStorage = await BlobStorage.connect();
	const usersQueue = await Queue.connect('runnerUsers');
	const runnerChannel = await Channel.connect<RunnerMessage>('runner');
	const concurrency = config.runner?.unsafeSandbox ? 1 :
		config.runner?.concurrency ?? (os.cpus().length >> 1) + 1;

	// Load shared terrain data
	const terrain = await blobStorage.load('terrain');
	const world = readWorld(terrain);
	loadTerrain(world); // pathfinder
	loadTerrainFromWorld(world); // game

	// Persistent player instances
	const playerInstances = new Map<string, PlayerInstance>();

	// Start the runner loop
	let gameTime = -1;
	runnerChannel.publish({ type: 'runnerConnected' });
	try {
		for await (const message of runnerChannel) {

			if (message.type === 'shutdown') {
				break;

			} else if (message.type === 'processUsers') {
				const roomBlobCache = new Map<string, Readonly<Uint8Array>>();
				gameTime = message.time;
				usersQueue.version(gameTime);
				await Promise.all(Array(concurrency).fill(undefined).map(async() => {
					for await (const userId of usersQueue) {
						const instance = await async function() {
							// Get existing instance
							const current = playerInstances.get(userId);
							if (current) {
								return current;
							}

							// Connect to channel, load user
							const [ codeChannel, userBlob ] = await Promise.all([
								Channel.connect<Code.Message>(`user/${userId}/code`),
								blobStorage.load(`user/${userId}/info`),
							]);
							const user = User.read(userBlob);

							// Set up player instance information
							const instance: PlayerInstance = {
								branch: user.code.branch,
								codeChannel,
								stale: false,
								roomsVisible: user.roomsVisible,
								writeConsole(fd, payload, evalResult?) {
									Channel.publish<Code.ConsoleMessage>(
										`user/${userId}/console`,
										{ type: 'console', [evalResult ? 'result' : 'log']: payload });
								},
							};
							codeChannel.listen(message => {
								if (message.type === 'eval') {
									if (!instance.consoleEval) {
										instance.consoleEval = [];
									}
									instance.consoleEval.push(message.expr);
								} else if (message.type === 'push') {
									instance.branch = message.id;
									instance.stale = true;
								}
							});

							playerInstances.set(userId, instance);
							return instance;
						}();

						const [ roomBlobs, sandbox ] = await Promise.all([
							// Load visible rooms for this user
							Promise.all(mapInPlace(instance.roomsVisible, async roomName =>
								roomBlobCache.get(roomName) ?? blobStorage.load(`room/${roomName}`).then(blob => {
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
										blobStorage.load(`user/${userId}/${instance.branch}`),
										// TODO: delete this undefined hack for TS types
										blobStorage.load(`memory/${userId}`).catch(() => undefined as any as Readonly<Uint8Array>),
									]);
									instance.sandbox = await createSandbox({ userId, codeBlob, memoryBlob, terrain, writeConsole: instance.writeConsole });
								}
								return instance.sandbox;
							}(),
						]);

						// Run user code
						const result = await async function() {
							try {
								return await sandbox.run(gameTime, roomBlobs, exchange(instance, 'consoleEval'));
							} catch (err) {
								return { intents: {} };
							}
						}();

						const [ savedRoomNames ] = await Promise.all([
							// Save intent blobs
							mapInPlace(Object.entries(result.intents), async([ roomName, intents ]) => {
								if (instance.roomsVisible.has(roomName)) {
									await blobStorage.save(`intents/${roomName}/${userId}`, new Uint8Array(intents!));
									return roomName;
								} else {
									console.error(`Runtime sent intent for non-visible room. User: ${userId}; Room: ${roomName}; Tick: ${gameTime}`);
								}
							}),
							// Save memory
							('memory' in result ? blobStorage.save(`memory/${userId}`, result.memory) : undefined),
						]);
						const roomNames = [ ...filterInPlace(await Promise.all(savedRoomNames)) ];
						runnerChannel.publish({ type: 'processedUser', userId, roomNames });
					}
				}));
			}
		}

	} finally {
		for (const instance of playerInstances.values()) {
			instance.codeChannel.disconnect();
			instance.sandbox?.dispose();
		}
		blobStorage.disconnect();
		usersQueue.disconnect();
		runnerChannel.disconnect();
	}
}
