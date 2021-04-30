import type { RunnerIntent } from 'xxscreeps/engine/runner/channel';
import type { RoomIntentPayload } from 'xxscreeps/processor';
export { registerDriverHooks, registerRuntimeInitializer, registerRuntimeTick } from './symbols';

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
}

export interface TickResult {
	intentPayloads: Record<string, RoomIntentPayload>;
}
