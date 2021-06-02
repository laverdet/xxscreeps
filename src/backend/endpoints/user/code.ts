import type { Database } from 'xxscreeps/engine/db';
import * as Code from 'xxscreeps/engine/db/user/code';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/db/user';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model';
import { registerBackendRoute } from 'xxscreeps/backend';

const kCodeSizeLimit = 5 * 1024 * 1024;
const kDefaultBranch = 'main';
const kMaxBranches = 30;

function checkBranchName(branchName: string): asserts branchName is string {
	if (typeof branchName !== 'string' || branchName.length > 30 || !/^[-_.a-zA-Z0-9]+$/.test(branchName)) {
		throw new Error('Invalid branch name');
	}
}

async function getBranchNameFromQuery(db: Database, userId: string, branchName: string) {
	if (!branchName || branchName === '$activeWorld') {
		return await db.data.hget(User.infoKey(userId), 'branch') ?? kDefaultBranch;
	}
	checkBranchName(branchName);
	return branchName;
}

registerBackendRoute({
	path: '/api/user/branches',

	async execute(context) {
		const { userId } = context.state;
		const branches = userId ? await context.db.data.smembers(Code.branchManifestKey(userId)) : undefined;

		if (!userId || !branches || branches.length === 0) {
			// Fake module list. `default` will be created on save
			return {
				ok: 1,
				list: [ {
					activeWorld: true,
					branch: kDefaultBranch,
					// Needed for ?withCode=true
					modules: { main: '' },
				} ],
			};
		}

		// First save has occurred
		const currentBranch = await context.shard.data.hget(User.infoKey(userId), 'branch');
		const withCode = Boolean(context.request.query.withCode);
		return {
			ok: 1,
			list: await Promise.all(Fn.map(branches, async branchName => {
				const content = withCode && {
					modules: await Code.loadContent(context.db, userId, branchName),
				};
				return {
					activeWorld: branchName === currentBranch,
					branch: branchName,
					...content,
				};
			})),
		};
	},
});

registerBackendRoute({
	path: '/api/user/clone-branch',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}

		// Check request
		const branch = await getBranchNameFromQuery(context.db, userId, context.request.body.branch);
		const { newName } = context.request.body;
		checkBranchName(newName);
		const key = Code.branchManifestKey(userId);
		const branches = await context.db.data.smembers(key);
		if (branches.length >= kMaxBranches) {
			throw new Error('Too many branches');
		} else if (branches.includes(newName)) {
			throw new Error('Branch already exists');
		} else if (!branches.includes(branch)) {
			return;
		}

		// Create the branch
		const timestamp = Date.now();
		const updated = await context.db.blob.copy(Code.contentKey(userId, branch), Code.contentKey(userId, newName));
		if (!updated) {
			throw new Error('Failed to copy');
		}
		await context.db.data.sadd(Code.branchManifestKey(userId), [ newName ]);

		return { ok: 1, timestamp };
	},
});

registerBackendRoute({
	path: '/api/user/set-active-branch',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const branch = await getBranchNameFromQuery(context.db, userId, context.request.body.branch);
		if (!await context.db.data.sismember(Code.branchManifestKey(userId), branch)) {
			return;
		}
		await context.db.data.hset(User.infoKey(userId), 'branch', branch);
		await Code.getUserCodeChannel(context.db, userId).publish({ type: 'switch', branch });
		return { ok: 1 };
	},
});

registerBackendRoute({
	path: '/api/user/code',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return { ok: 1, branch: kDefaultBranch, modules: { main: '' } };
		}
		const branchName = await getBranchNameFromQuery(context.db, userId, context.request.body.branch);
		const payload = await Code.loadContent(context.db, userId, branchName);
		if (!payload) {
			if (branchName === kDefaultBranch) {
				return { ok: 1, branch: kDefaultBranch, modules: { main: '' } };
			} else {
				return;
			}
		}
		return { ok: 1, branch: branchName, modules: Fn.fromEntries(payload) };
	},
});

registerBackendRoute({
	path: '/api/user/code',
	method: 'post',

	async execute(context) {
		// Validate this code payload
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { modules } = context.request.body;
		modules.main ??= '';
		const size = Fn.accumulate(Fn.map(Object.values(modules), module => {
			if (typeof module !== 'string') {
				throw new TypeError('Invalid payload');
			}
			return module.length;
		}));
		if (size > kCodeSizeLimit) {
			throw new Error('Too much code');
		}

		// Save it
		const branchName = await getBranchNameFromQuery(context.db, userId, context.request.body.branch);
		await Code.saveContent(context.db, userId, branchName, new Map(Object.entries(modules)));
		return { ok: 1 };
	},
});

registerBackendRoute({
	path: '/api/user/console',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return;
		}
		const { expression } = context.request.body;
		if (typeof expression !== 'string') {
			throw new TypeError('Invalid expression');
		}
		try {
			// Try to parse it
			// eslint-disable-next-line no-new, @typescript-eslint/no-implied-eval
			new Function(expression);
			await getRunnerUserChannel(context.shard, userId).publish({ type: 'eval', expr: context.request.body.expression });
		} catch (err) {
			await getConsoleChannel(context.shard, userId).publish({ type: 'error', value: err.message });
		}
		return { ok: 1 };
	},
});
