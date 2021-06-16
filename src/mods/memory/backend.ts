import type { Shard } from 'xxscreeps/engine/db';
import config from 'xxscreeps/config';
import { gzip } from 'zlib';
import { hooks } from 'xxscreeps/backend';
import { loadUserMemoryBlob } from 'xxscreeps/mods/memory/model';
import { mustNotReject } from 'xxscreeps/utility/async';
import { typedArrayToString } from 'xxscreeps/utility/string';
import { throttle } from 'xxscreeps/utility/utility';
import { requestRunnerEvalAck } from 'xxscreeps/engine/runner/model';

async function loadAndParse(shard: Shard, userId: string, path?: string) {
	const blob = await loadUserMemoryBlob(shard, userId);
	const string = blob && typedArrayToString(new Uint16Array(blob.buffer, 0, blob.length >>> 1));
	if (path && string) {
		try {
			let memory = JSON.parse(string);
			const parts = path.split('.');
			while (memory && parts.length) {
				memory = memory[parts.shift()!];
			}
			if (memory) {
				return JSON.stringify(memory);
			}
		} catch (err) {}
	} else {
		return string;
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
		const check = throttle(() => mustNotReject(async() => {
			// Load memory and send if updated
			const payload = await loadAndParse(shard, user, params.path);
			if (previous !== payload) {
				previous = payload;
				this.send(payload ?? 'Incorrect memory path');
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

hooks.register('route', {
	path: '/api/user/memory',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const memory = await loadAndParse(context.shard, userId, context.request.query.path as string);
		if (memory) {
			// WHYYYYYYYYYYYYYY
			const gzipBase64 = await new Promise<string>((resolve, reject) => {
				gzip(memory, (err, value) => err ? reject(err) : resolve(value.toString('base64')));
			});
			return { ok: 1, data: `gz:${gzipBase64}` };
		} else {
			return { ok: 1, data: 'Incorrect memory path' };
		}
	},
});

hooks.register('route', {
	path: '/api/user/memory',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const path: string = context.request.body.path;
		const rawValue = context.request.body.value;
		const value = rawValue && JSON.stringify(rawValue);
		if (value && value.length > 1024 * 1024) {
			throw new Error('Memory size is too large');
		}
		const expression = function() {
			if (path) {
				const property = path.split('.').map(fragment => `[${JSON.stringify(fragment)}]`).join('');
				return value ? `Memory${property} = ${value}; undefined;` : `delete Memory${property}`;
			} else {
				return `Object.keys(Memory).forEach(key => delete Memory[key]); Object.assign(Memory, ${value}); undefined;`;
			}
		}();
		await requestRunnerEvalAck(context.shard, userId, expression, false);
		return { ok: 1 };
	},
});
