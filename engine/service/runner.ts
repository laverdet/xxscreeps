import * as Schema from '~/engine/metabase/index';
import * as DatabaseSchema from '~/engine/metabase';
import { getReader } from '~/engine/schema/read';
import { Sandbox } from '~/driver/sandbox';
import { BufferView } from '~/engine/schema/buffer-view';
import { mapInPlace, filterInPlace } from '~/lib/utility';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { RunnerMessage } from '.';

export default async function() {

	// Connect to main & storage
	const blobStorage = await BlobStorage.connect();
	const usersQueue = await Queue.connect('runnerUsers');
	const runnerChannel = await Channel.connect<RunnerMessage>('runner');

	// Placeholder
	const gameReader = getReader(DatabaseSchema.schema.Game, DatabaseSchema.interceptorSchema);
	const gameMetadata = gameReader(BufferView.fromTypedArray(await blobStorage.load('game')), 0);

	// Initialize binary schemas
	const readCode = getReader(Schema.schema.Code, Schema.interceptorSchema);

	// Start the runner loop
	let gameTime = -1;
	runnerChannel.publish({ type: 'runnerConnected' });
	try {
		for await (const message of runnerChannel) {

			if (message.type === 'processUsers') {
				gameTime = message.time;
				usersQueue.version(gameTime);
				for await (const userId of usersQueue) {
					const codeBlob = await blobStorage.load(`code/${userId}`);
					const userCode = readCode(BufferView.fromTypedArray(codeBlob), 0);

					// Load visible rooms for this user
					const { visibleRooms } = gameMetadata.users.get(userId)!;
					const roomBlobs = await Promise.all(mapInPlace(visibleRooms, roomName =>
						blobStorage.load(`ticks/${gameTime}/${roomName}`),
					));

					// Create sandbox and run code
					const sandbox = await Sandbox.create(userId, userCode);
					const result = await sandbox.run(gameTime, roomBlobs);

					// Save intent blobs
					const savedRoomNames = mapInPlace(Object.entries(result.intents), async([ roomName, intents ]) => {
						if (visibleRooms.has(roomName)) {
							await blobStorage.save(`intents/${roomName}/${userId}`, new Uint8Array(intents!));
							return roomName;
						} else {
							console.error(`Runtime sent intent for non-visible room. User: ${userId}; Room: ${roomName}; Tick: ${gameTime}`);
						}
					});
					const roomNames = [ ...filterInPlace(await Promise.all(savedRoomNames),
						(roomName): roomName is string => roomName !== undefined) ];
					runnerChannel.publish({ type: 'processedUser', userId, roomNames });
				}
			}
		}

	} finally {
		blobStorage.disconnect();
		usersQueue.disconnect();
		runnerChannel.disconnect();
	}
}
