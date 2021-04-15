import config from 'xxscreeps/config';
import * as Fn from 'xxscreeps/utility/functional';
import { Shard } from 'xxscreeps/engine/model/shard';
import { userToRoomsSetKey } from 'xxscreeps/engine/model/processor';
import { getRunnerChannel, runnerUsersSetKey } from 'xxscreeps/engine/runner/model';
import { loadTerrainFromWorld, readWorld } from 'xxscreeps/game/map';
import { loadTerrain } from 'xxscreeps/driver/path-finder';
import { PlayerInstance } from 'xxscreeps/engine/runner/instance';
import { consumeSet } from 'xxscreeps/storage/async';
import { getOrSet } from 'xxscreeps/utility/utility';
import { getServiceChannel } from '.';

// Connect to main & storage
const shard = await Shard.connect('shard0');
const runnerSubscription = await getRunnerChannel(shard).subscribe();
const concurrency = config.runner.unsafeSandbox ? 1 : config.runner.concurrency;

// Load shared terrain data
const world = readWorld(shard.terrainBlob);
loadTerrain(world); // pathfinder
loadTerrainFromWorld(world); // game

// Persistent player instances
const playerInstances = new Map<string, PlayerInstance>();

// Start the runner loop
try {
	await getServiceChannel(shard).publish({ type: 'runnerConnected' });
	for await (const message of runnerSubscription) {

		if (message.type === 'shutdown') {
			break;

		} else if (message.type === 'run') {
			const { time } = message;
			const roomBlobCache = new Map<string, Promise<Readonly<Uint8Array>>>();
			await Promise.all(Fn.map(Fn.range(concurrency), async() => {
				for await (const userId of consumeSet(shard.scratch, runnerUsersSetKey(time))) {
					// Get or create player instance
					const instance = playerInstances.get(userId) ?? await async function() {
						const instance = await PlayerInstance.create(shard, userId);
						playerInstances.set(userId, instance);
						return instance;
					}();

					// Load visible rooms for this user
					const roomNames = await shard.scratch.smembers(userToRoomsSetKey(userId));
					const roomBlobs = await Promise.all(Fn.map(roomNames, roomName =>
						getOrSet(roomBlobCache, roomName, () => shard.loadRoomBlob(roomName, time - 1))));

					// Run user code
					await instance.run(time, roomBlobs, roomNames);
				}
			}));
		}
	}

} finally {
	for (const instance of playerInstances.values()) {
		instance.disconnect();
	}
	runnerSubscription.disconnect();
	shard.disconnect();
}
