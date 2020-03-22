import * as Schema from '~/engine/metabase/index';
import * as DatabaseSchema from '~/engine/metabase';
import { getReader } from '~/engine/schema/read';
import { Sandbox } from '~/driver/sandbox';
import { BufferView } from '~/engine/schema/buffer-view';
import { mapInPlace } from '~/lib/utility';
import { topLevelTask } from '~/lib/task';
import { BlobStorage } from '~/storage/blob';
import { Channel } from '~/storage/channel';
import { Queue } from '~/storage/queue';
import { RunnerMessage } from '.';

topLevelTask(async() => {

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

					// eslint-disable-next-line no-loop-func
					const roomBlobs = await Promise.all(mapInPlace(gameMetadata.activeRooms, (roomName: string) =>
						blobStorage.load(`ticks/${gameTime}/${roomName}`)));

					const sandbox = await Sandbox.create(userId, userCode);
					await sandbox.run(gameTime, roomBlobs);
					runnerChannel.publish({ type: 'processedUser', id: userId });
				}
			}
		}

	} finally {
		blobStorage.disconnect();
		usersQueue.disconnect();
		runnerChannel.disconnect();
	}
});
