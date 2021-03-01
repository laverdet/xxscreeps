import assert from 'assert';
import * as Room from 'xxscreeps/engine/room';
import { mapInPlace } from 'xxscreeps/util/utility';
import { ProcessorContext } from 'xxscreeps/engine/processor/context';
import 'xxscreeps/config/mods/processor';
import 'xxscreeps/engine/processor/intents';
import * as Invader from 'xxscreeps/engine/processor/intents/invader/main';
import * as Game from 'xxscreeps/game/game';
import { loadTerrain } from 'xxscreeps/game/map';
import * as Memory from 'xxscreeps/game/memory';
import * as Storage from 'xxscreeps/storage';
import { Channel } from 'xxscreeps/storage/channel';
import { Queue } from 'xxscreeps/storage/queue';
import { ProcessorMessage, ProcessorQueueElement } from '.';

// Keep track of rooms this thread ran. Global room processing must also happen here.
const processedRooms = new Map<string, ProcessorContext>();

// Connect to main & storage
const storage = await Storage.connect('shard0');
const { persistence } = storage;
const roomsQueue = Queue.connect<ProcessorQueueElement>(storage, 'processRooms', true);
const processorChannel = await new Channel<ProcessorMessage>(storage, 'processor').subscribe();

// Initialize world terrain
await loadTerrain(persistence);

// Start the processing loop
let gameTime = -1;
await processorChannel.publish({ type: 'processorConnected' });
try {
	for await (const message of processorChannel) {

		if (message.type === 'shutdown') {
			break;

		} else if (message.type === 'processRooms') {
			// First processing phase. Can start as soon as all players with visibility into this room
			// have run their code
			gameTime = message.time;
			roomsQueue.version(`${gameTime}`);
			for await (const { room, users } of roomsQueue) {
				// Read room data and intents from storage
				const [ roomBlob, intents ] = await Promise.all([
					persistence.get(`room/${room}`),
					Promise.all(mapInPlace(users, async user => ({
						user,
						intents: await persistence.get(`intents/${room}/${user}`),
					}))),
				]);
				const deleteIntentBlobs = Promise.all(mapInPlace(intents, ({ user }) =>
					persistence.del(`intents/${room}/${user}`)));
				const roomInstance = Room.read(roomBlob);

				// Run NPC scripts
				const npcIntents = Array.from(roomInstance._npcs).map(npc => {
					const memory = roomInstance._npcMemory.get(npc) ?? new Uint8Array(0);
					Memory.initialize(memory);
					Game.initializeIntents();
					const result = Game.runAsUser(npc, gameTime, () =>
						Game.runWithState([ roomInstance ], () => Invader.loop()));
					if (result) {
						roomInstance._npcMemory.set(npc, Memory.flush());
					} else {
						roomInstance._npcs.delete(npc);
						roomInstance._npcMemory.delete(npc);
					}
					return {
						user: npc,
						intents: Game.flushIntents().intentsByGroup,
					};
				});

				// Process intents
				const context = new ProcessorContext(gameTime, roomInstance);
				Game.runWithState([ roomInstance ], () => {
					for (const { user, intents } of npcIntents) {
						context.processIntents(user, intents[room] ?? {});
					}
					for (const intentInfo of intents) {
						assert.equal(intentInfo.intents.byteOffset, 0);
						const uint16 = new Uint16Array(intentInfo.intents.buffer);
						const intents = JSON.parse(String.fromCharCode(...uint16));
						context.processIntents(intentInfo.user, intents);
					}
					context.processTick();
				});
				// Save and notify main service of completion
				await deleteIntentBlobs;
				processedRooms.set(room, context);
				await processorChannel.publish({ type: 'processedRoom', roomName: room });
			}

		} else if (message.type === 'flushRooms') {
			// Run second phase of processing. This must wait until *all* player code and first phase
			// processing has run
			await Promise.all(mapInPlace(processedRooms, ([ roomName, context ]) =>
				persistence.set(`room/${roomName}`, Room.write(context.room)),
			));
			await processorChannel.publish({ type: 'flushedRooms', roomNames: [ ...processedRooms.keys() ] });
			processedRooms.clear();
		}
	}

} finally {
	storage.disconnect();
	processorChannel.disconnect();
}
