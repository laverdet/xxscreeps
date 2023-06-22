import type { Shard } from 'xxscreeps/engine/db/index.js';
import config from 'xxscreeps/config/index.js';
import { gzip } from 'zlib';
import { hooks } from 'xxscreeps/backend/index.js';
import { loadUserMemoryString } from 'xxscreeps/mods/memory/model.js';
import { mustNotReject } from 'xxscreeps/utility/async.js';
import { throttle } from 'xxscreeps/utility/utility.js';
import { requestRunnerEval } from 'xxscreeps/engine/runner/model.js';

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
	} catch (err) {
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
		const check = throttle(() => mustNotReject(async() => {
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

hooks.register('route', {
	path: '/api/user/memory',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const memory = await loadAndParse(context.shard, userId, context.request.query.path as string);
		if (memory === undefined) {
			return { ok: 1 };
		}
		// WHYYYYYYYYYYYYYY
		const gzipBase64 = await new Promise<string>((resolve, reject) => {
			gzip(
				`${JSON.stringify(memory)}`,
				(err, value) => err ? reject(err) : resolve(value.toString('base64')));
		});
		return { ok: 1, data: `gz:${gzipBase64}` };
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
				return value === undefined ? `delete Memory${property};` : `Memory${property} = ${value}; undefined;`;
			} else {
				return `Object.keys(Memory).forEach(key => delete Memory[key]); Object.assign(Memory, ${value}); undefined;`;
			}
		}();
		await requestRunnerEval(context.shard, userId, expression, false);
		return { ok: 1 };
	},
});
