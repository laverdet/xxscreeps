import type { Shard } from 'xxscreeps/engine/db/shard.js';
import type { CodeBlobs } from 'xxscreeps/engine/db/user/code-schema.js';
import type { RoomIntentPayload } from 'xxscreeps/engine/processor/index.js';

export { hooks } from './symbols.js';

export interface RunnerWorker extends AsyncDisposable {
	shard: Shard;
}

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
	backendIntents?: RunnerPlayerIntent[];
	eval: RunnerPlayerEvalPayload[];
	usernames?: Record<string, string>;
	// User ids a connector wants resolved to usernames this tick (e.g. market transaction parties not
	// visible in any of the player's rooms). The runner merges these into the unseen-user resolution.
	userIds?: string[];
}

export interface TickResult {
	error?: true;
	console: string | undefined;
	evalAck?: {
		id: string;
		result: {
			error: boolean;
			value: string | undefined;
		};
	}[];
	intentPayloads: Record<string, RoomIntentPayload>;
	usage: TickUsageResult;
}

export interface TickUsageResult {
	cpu?: number;
}

/** @internal */
export interface RunnerPlayerEvalPayload {
	ack?: string;
	echo: boolean;
	expr: string;
}

/** @internal */
export interface RunnerPlayerIntent {
	receiver: string;
	intent: string;
	params: unknown[];
}
