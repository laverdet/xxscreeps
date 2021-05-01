import type { Endpoint } from 'xxscreeps/backend';
import * as Code from 'xxscreeps/engine/metadata/code';
import * as Fn from 'xxscreeps/utility/functional';
import * as User from 'xxscreeps/engine/metadata/user';
import * as Id from 'xxscreeps/engine/schema/id';
import { getConsoleChannel } from 'xxscreeps/engine/model/user';
import { getRunnerUserChannel } from 'xxscreeps/engine/runner/channel';

const kCodeSizeLimit = 5 * 1024 * 1024;
const kDefaultBranch = 'master';
const kMaxBranches = 30;

function getBranchIdFromQuery(branch: any, user: User.User, create: true): { id: string; name: string };
function getBranchIdFromQuery(branch: any, user: User.User, create?: false): { id?: string; name: string };
function getBranchIdFromQuery(branch: any, user: User.User, create = false) {
	// Get branch id
	let id = function() {
		if (branch == null || branch[0] === '$') {
			return user.code.branch;
		} else {
			return Fn.firstMatching(user.code.branches, info => info.name === branch)?.id;
		}
	}();
	// Possibly need to create the default branch
	if (id == null) {
		if (create) {
			if (branch != null && branch[0] !== '$' && branch !== kDefaultBranch) {
				throw new Error('Branch does not exist');
			}
			id = Id.generateId(12);
			user.code.branch = id;
			user.code.branches.push({
				id,
				name: branch ?? kDefaultBranch,
				timestamp: Date.now() / 1000,
			});
		} else {
			return { name: kDefaultBranch };
		}
	}
	// Get branch name
	return {
		id,
		name: Fn.firstMatching(user.code.branches, branch => branch.id === id)!.name,
	};
}

const BranchesEndpoint: Endpoint = {
	path: '/api/user/branches',

	async execute(context) {
		const { userId } = context.state;
		const userBlob = await context.shard.blob.getBuffer(`user/${userId}/info`);
		const user = userBlob && User.read(userBlob);

		if (!user || user.code.branches.length === 0) {
			// Fake module list. `default` will be created on save
			return {
				ok: 1,
				list: [
					{
						activeWorld: true,
						branch: kDefaultBranch,
						modules: { main: '' },
						timestamp: Date.now(),
						user: userId,
					},
				],
			};
		}

		// First save has occurred
		return {
			ok: 1,
			list: await Promise.all(user.code.branches.map(async branch => {
				const code = Code.read(await context.shard.blob.reqBuffer(`user/${userId}/${branch.id}`));
				return {
					activeWorld: branch.id === user.code.branch,
					branch: branch.name,
					modules: Fn.fromEntries(code.modules),
					timestamp: branch.timestamp * 1000,
					user: userId,
				};
			})),
		};
	},
};

const BranchCloneEndpoint: Endpoint = {
	path: '/api/user/clone-branch',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const { branch, newName } = context.request.body;
		if (typeof newName !== 'string' || !/^[-_.a-zA-Z0-9]+$/.test(newName)) {
			throw new Error('Invalid branch name');
		}
		const timestamp = Math.floor(Date.now() / 1000);

		await context.backend.gameMutex.scope(async() => {
			const user = User.read(await context.shard.blob.reqBuffer(`user/${userId}/info`));
			// Validity checks
			if (user.code.branches.length > kMaxBranches) {
				throw new Error('Too many branches');
			} else if (user.code.branches.some(branch => branch.name === newName)) {
				throw new Error('Branch already exists');
			}
			const branchId = Fn.firstMatching(user.code.branches, info => info.name === branch)?.id;
			if (branchId === undefined) {
				throw new Error('Branch does not exist');
			}
			// Create the branch
			const newId = Id.generateId(12);
			user.code.branches.push({
				id: newId,
				name: newName,
				timestamp,
			});
			// Save blobs
			await Promise.all([
				context.shard.blob.set(`user/${userId}/info`, User.write(user)),
				context.shard.blob.set(`user/${userId}/${newId}`,
					await context.shard.blob.reqBuffer(`user/${userId}/${branchId}`)),
			]);
		});

		return { ok: 1, timestamp: timestamp * 1000 };
	},
};

const BranchSetEndpoint: Endpoint = {
	path: '/api/user/set-active-branch',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const { branch } = context.request.body;
		await context.backend.gameMutex.scope(async() => {
			const user = User.read(await context.shard.blob.reqBuffer(`user/${userId}/info`));
			const { id, name } = getBranchIdFromQuery(branch, user);
			if (id === undefined) {
				throw new Error('Invalid branch');
			}
			user.code.branch = id;
			await context.shard.blob.set(`user/${userId}/info`, User.write(user));
			await getRunnerUserChannel(context.backend.shard, userId!).publish({ type: 'code', id, name });
		});

		return { ok: 1 };
	},
};

const CodeEndpoint: Endpoint = {
	path: '/api/user/code',

	async execute(context) {
		const { userId } = context.state;
		if (!userId) {
			return { ok: 1, branch: kDefaultBranch, modules: { main: '' } };
		}
		const { branch } = context.request.body;
		const user = User.read(await context.shard.blob.reqBuffer(`user/${userId}/info`));
		const { id, name } = getBranchIdFromQuery(branch, user);
		if (id === undefined) {
			return { ok: 1, branch: name, modules: { main: '' } };
		}

		const code = Code.read(await context.shard.blob.reqBuffer(`user/${userId}/${id}`));
		return { ok: 1, branch: name, modules: Fn.fromEntries(code.modules) };
	},
};

const CodePostEndpoint: Endpoint = {
	path: '/api/user/code',
	method: 'post',

	async execute(context) {
		// Validate this code payload
		const { userId } = context.state;
		const { branch, modules } = context.request.body;
		let size = 0;
		for (const module of Object.values(modules)) {
			if (typeof module !== 'string') {
				throw new TypeError('Invalid payload');
			}
			size += module.length;
		}
		if (size > kCodeSizeLimit) {
			throw new Error('Too much code');
		}

		// Save it
		const timestamp = Math.floor(Date.now() / 1000);
		await context.backend.gameMutex.scope(async() => {
			// Load user branch manifest
			const user = User.read(await context.shard.blob.reqBuffer(`user/${userId}/info`));
			const { id, name } = getBranchIdFromQuery(branch, user, true);

			// Update manifest timestamp
			for (const branch of user.code.branches) {
				if (branch.id === id) {
					branch.timestamp = timestamp;
					break;
				}
			}

			// Save blobs
			await Promise.all([
				context.shard.blob.set(`user/${userId}/info`, User.write(user)),
				context.shard.blob.set(`user/${userId}/${id}`, Code.write({
					modules: new Map(Object.entries(modules)),
				})),
			]);
			await getRunnerUserChannel(context.backend.shard, userId!).publish({ type: 'code', id, name });
		});
		return { ok: 1, timestamp: timestamp * 1000 };
	},
};

const ConsoleEndpoint: Endpoint = {
	path: '/api/user/console',
	method: 'post',

	async execute(context) {
		const { userId } = context.state;
		const { expression } = context.request.body;
		if (typeof expression !== 'string') {
			throw new TypeError('Invalid expression');
		}
		try {
			// Try to parse it
			// eslint-disable-next-line no-new, @typescript-eslint/no-implied-eval
			new Function(expression);
			await getRunnerUserChannel(context.shard, userId!).publish({ type: 'eval', expr: context.request.body.expression });
		} catch (err) {
			await getConsoleChannel(context.shard, userId!).publish({ type: 'error', value: err.message });
		}
		return { ok: 1 };
	},
};

export default [ BranchesEndpoint, BranchCloneEndpoint, BranchSetEndpoint, BranchSetEndpoint, CodeEndpoint, CodePostEndpoint, ConsoleEndpoint ];
