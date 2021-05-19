import type { RunnerIntent } from 'xxscreeps/engine/runner/channel';
import type { RoomIntentPayload } from 'xxscreeps/engine/processor';
export { registerDriverConnector, registerRuntimeConnector } from './symbols';

export interface InitializationPayload {
	userId: string;
	codeBlob: Readonly<Uint8Array>;
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
