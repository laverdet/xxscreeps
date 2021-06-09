import type { RunnerIntent } from 'xxscreeps/engine/runner/channel';
import type { RoomIntentPayload } from 'xxscreeps/engine/processor';
import type { CodeBlobs } from 'xxscreeps/engine/db/user/code-schema';
export { registerDriverConnector, registerRuntimeConnector } from './symbols';

export interface InitializationPayload {
	userId: string;
	codeBlob: CodeBlobs;
	shardName: string;
	terrainBlob: Readonly<Uint8Array>;
}

export interface TickPayload {
	time: number;
	roomBlobs: Readonly<Uint8Array>[];
	consoleEval?: string[];
	backendIntents?: RunnerIntent[];
	usernames?: Record<string, string>;
}

export interface TickResult {
	intentPayloads: Record<string, RoomIntentPayload>;
}
