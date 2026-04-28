import type { MessageFor } from 'xxscreeps/engine/db/channel.js';
import type { CodeBlobs } from 'xxscreeps/engine/db/user/code-schema.js';
import type { RoomIntentPayload } from 'xxscreeps/engine/processor/index.js';
import type { RunnerIntent, getRunnerUserChannel } from 'xxscreeps/engine/runner/model.js';
import type { UserIntentPayload } from 'xxscreeps/game/intents.js';

export { hooks } from './symbols.js';

export interface InitializationPayload {
	userId: string;
	codeBlob: CodeBlobs | undefined;
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
	time: number;
	backendIntents?: RunnerIntent[];
	eval: Extract<MessageFor<typeof getRunnerUserChannel>, { type: 'eval' }>['payload'][];
	usernames?: Record<string, string>;
}

export interface TickResult {
	error?: true;
	console: string | undefined;
	evalAck?: {
		id: string;
		result: {
			error: boolean;
			value: string;
		};
	}[];
	intentPayloads: Record<string, RoomIntentPayload>;
	userIntents?: UserIntentPayload;
	usage: TickUsageResult;
}

export interface TickUsageResult {
	cpu?: number;
}
