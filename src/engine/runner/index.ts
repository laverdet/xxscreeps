import type { CodeBlobs } from 'xxscreeps/engine/db/user/code-schema';
import type { MessageFor } from 'xxscreeps/engine/db/channel';
import type { RunnerIntent, getRunnerUserChannel } from 'xxscreeps/engine/runner/model';
import type { RoomIntentPayload } from 'xxscreeps/engine/processor';
export { hooks } from './symbols';

export interface InitializationPayload {
	userId: string;
	codeBlob: CodeBlobs;
	shardName: string;
	terrainBlob: Readonly<Uint8Array>;
}

export interface TickPayload {
	cpu: {
		bucket: number;
		limit: number;
		tickLimit: number;
	};
	roomBlobs: Readonly<Uint8Array>[];
	roomBlobsPromise: Promise<Readonly<Uint8Array>[]>;
	time: number;
	backendIntents?: RunnerIntent[];
	eval: Extract<MessageFor<typeof getRunnerUserChannel>, { type: 'eval' }>['payload'][];
	usernames?: Record<string, string>;
}

export interface TickResult {
	evalAck?: {
		id: string;
		result: {
			error: boolean;
			value: string;
		};
	}[];
	intentPayloads: Record<string, RoomIntentPayload>;
	usage: any;
}
