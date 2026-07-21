import type { JSONSchemaType } from 'ajv';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import { gzip } from 'node:zlib';
import { hooks, makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import { config } from 'xxscreeps/config/index.js';
import { requestRunnerEval } from 'xxscreeps/engine/runner/model.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { typedArrayToString, utf16ToBuffer } from 'xxscreeps/utility/string.js';
import { throttle } from 'xxscreeps/utility/utility.js';
import { isValidSegmentId, kMaxMemorySegmentLength } from './memory.js';
import { loadMemorySegmentBlob, loadUserMemoryString, publicSegmentChannel, saveMemorySegmentBlob } from './model.js';

const invalidPath = 'Incorrect memory path';
const emptyObject = Object.create(null);

async function loadAndParse(shard: Shard, userId: string, path?: string) {
	const string = await loadUserMemoryString(shard, userId);
	try {
		if (string === null) {
			return path ? invalidPath : null;
		}
		const memory = JSON.parse(string);
		if (path) {
			const value = path.split('.').reduce((memory, key) => key in memory ? memory[key] : emptyObject, memory);
			return value === emptyObject ? invalidPath : value;
		} else {
			return memory;
		}
	} catch {
		return invalidPath;
	}
}

hooks.register('subscription', {
	pattern: /^user:(?<user>[^/]+)\/memory\/(?<shard>[^/]+)\/(?<path>.+)$/,

	subscribe(params) {
		const { user } = params;
		const { shard } = this.context;
		if (!this.user || user !== this.user) {
			return () => {};
		}
		let previous: any;
		const check = throttle(() => mustNotReject(async () => {
			// Load memory and send if updated
			const memory = JSON.stringify(`${await loadAndParse(shard, user, params.path)}`);
			if (previous !== memory) {
				previous = memory;
				this.send(memory);
			}
		}));
		// Subscribe to game tick updates
		const subscription = this.context.shard.channel.listen(() => check.set(config.backend.socketThrottle));
		return () => {
			subscription();
			check.clear();
		};
	},
});

interface MemoryGetRequest {
	path?: string | null;
}

const memoryGetRequestSchema: JSONSchemaType<MemoryGetRequest> = {
	type: 'object',
	properties: {
		path: { type: 'string', nullable: true },
	},
	required: [],
};

hooks.register('route', {
	path: '/api/user/memory',

	execute: makeValidatedQueryRoute(memoryGetRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const memory = await loadAndParse(context.shard, userId, context.request.query.path ?? undefined);
		if (memory === undefined) {
			return { ok: 1 };
		}
		// WHYYYYYYYYYYYYYY
		const gzipBase64 = await new Promise<string>((resolve, reject) => {
			gzip(
				JSON.stringify(memory),
				(err, value) => err ? reject(err) : resolve(value.toString('base64')));
		});
		return { ok: 1, data: `gz:${gzipBase64}` };
	}),
});

interface MemoryPostRequest {
	path?: string | null;
	value?: string | null;
}

const memoryPostRequestSchema: JSONSchemaType<MemoryPostRequest> = {
	type: 'object',
	properties: {
		path: { type: 'string', nullable: true },
		value: { type: 'string', nullable: true },
	},
	required: [],
};

hooks.register('route', {
	path: '/api/user/memory',
	method: 'post',

	execute: makeValidatedPayloadRoute(memoryPostRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const { path } = context.request.body;
		const value = function() {
			const { value } = context.request.body;
			if (value !== undefined) {
				return JSON.stringify(value);
			}
		}();
		if (value !== undefined && value.length > 1024 * 1024) {
			throw new Error('Memory size is too large');
		}
		const expression = function() {
			if (path) {
				const property = path.split('.').map(fragment => `[${JSON.stringify(fragment)}]`).join('');
				return value === undefined ? `delete Memory${property};` : `Memory${property} = ${value}; undefined;`;
			} else {
				return `Object.keys(Memory).forEach(key => delete Memory[key]); Object.assign(Memory, ${value}); undefined;`;
			}
		}();
		await requestRunnerEval(context.shard, userId, expression, false);
		return { ok: 1 };
	}),
});

interface SegmentGetRequest {
	segment: string;
}

const segmentGetRequestSchema: JSONSchemaType<SegmentGetRequest> = {
	type: 'object',
	properties: {
		segment: { type: 'string' },
	},
	required: [ 'segment' ],
};

hooks.register('route', {
	path: '/api/user/memory-segment',

	execute: makeValidatedQueryRoute(segmentGetRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const segmentId = Number(context.request.query.segment);
		if (!isValidSegmentId(segmentId)) {
			return { error: 'invalid segment' };
		}
		const blob = await loadMemorySegmentBlob(context.shard, userId, segmentId);
		// Missing segments read as an empty string, same as `RawMemory.segments` in the runtime
		const data = blob === null ? '' : typedArrayToString(new Uint16Array(blob.buffer, blob.byteOffset, blob.length >>> 1));
		return { ok: 1, data };
	}),
});

interface SegmentPostRequest {
	segment: number;
	data: string;
}

const segmentPostRequestSchema: JSONSchemaType<SegmentPostRequest> = {
	type: 'object',
	properties: {
		segment: { type: 'number' },
		data: { type: 'string' },
	},
	required: [ 'segment', 'data' ],
};

hooks.register('route', {
	path: '/api/user/memory-segment',
	method: 'post',

	execute: makeValidatedPayloadRoute(segmentPostRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const { segment, data } = context.request.body;
		if (!isValidSegmentId(segment)) {
			return { error: 'invalid segment' };
		}
		if (data.length > kMaxMemorySegmentLength) {
			throw new Error('Memory segment size is too large');
		}
		await Promise.all([
			saveMemorySegmentBlob(context.shard, userId, segment, utf16ToBuffer(data)),
			publicSegmentChannel(context.shard, userId).publish({ type: 'segment', id: segment }),
		]);
		return { ok: 1 };
	}, { coerceTypes: true }),
});
