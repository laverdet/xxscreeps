import os from 'os';
import config from 'xxscreeps/config';
import * as Fn from 'xxscreeps/utility/functional';
import { Shard } from 'xxscreeps/engine/model/shard';
import { loadTerrainFromWorld, readWorld } from 'xxscreeps/game/map';
import { loadTerrain } from 'xxscreeps/driver/path-finder';
import { PlayerInstance } from 'xxscreeps/engine/runner/instance';
import * as Storage from 'xxscreeps/storage';
import { Channel } from 'xxscreeps/storage/channel';
import { Queue } from 'xxscreeps/storage/queue';
import { RunnerMessage } from '.';

// Connect to main & storage
const shard = await Shard.connect('shard0');
const storage = await Storage.connect('shard0');
const usersQueue = Queue.connect(storage, 'runnerUsers');
const runnerChannel = await new Channel<RunnerMessage>(storage, 'runner').subscribe();
const concurrency = config.runner?.unsafeSandbox ? 1 :
	config.runner?.concurrency ?? (os.cpus().length >> 1) + 1;

// Load shared terrain data
const world = readWorld(shard.terrainBlob);
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
						// Create new instance
						const instance = await PlayerInstance.create(shard, userId);
						playerInstances.set(userId, instance);
						return instance;
					}();

					// Load visible rooms for this user
					const roomBlobs = await Promise.all(Fn.map(instance.roomsVisible, roomName =>
						roomBlobCache.get(roomName) ?? shard.loadRoomBlob(roomName, gameTime - 1).then(blob => {
							roomBlobCache.set(roomName, blob);
							return blob;
						})));

					// Run user code
					const roomNames = await instance.run(gameTime, roomBlobs);
					await runnerChannel.publish({ type: 'processedUser', userId, roomNames });
				}
			}));
		}
	}

} finally {
	for (const instance of playerInstances.values()) {
		instance.disconnect();
	}
	storage.disconnect();
	runnerChannel.disconnect();
}
