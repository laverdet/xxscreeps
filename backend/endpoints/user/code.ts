import { Endpoint } from '~/backend/endpoint';
import * as Code from '~/engine/metadata/code';
import * as User from '~/engine/metadata/user';
import * as Id from '~/engine/util/schema/id';
import { RunnerUserMessage } from '~/engine/service/runner';
import { firstMatching, mapToKeys } from '~/lib/utility';
import { Channel } from '~/storage/channel';

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
			return firstMatching(user.code.branches, info => info.name === branch)?.id;
		}
	}();
	// Possibly need to create the default branch
	if (id === undefined) {
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
		name: firstMatching(user.code.branches, branch => branch.id === id)!.name,
	};
}

const BranchesEndpoint: Endpoint = {
	path: '/branches',

	async execute(req) {
		const { userid } = req;
		const userBlob = await this.context.persistence.get(`user/${userid}/info`).catch(() => {});
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
						user: userid,
					},
				],
			};
		}

		// First save has occurred
		return {
			ok: 1,
			list: await Promise.all(user.code.branches.map(async branch => {
				const code = Code.read(await this.context.persistence.get(`user/${userid}/${branch.id}`));
				return {
					activeWorld: branch.id === user.code.branch,
					branch: branch.name,
					modules: mapToKeys(code.modules),
					timestamp: branch.timestamp * 1000,
					user: userid,
				};
			})),
		};
	},
};

const BranchCloneEndpoint: Endpoint = {
	path: '/clone-branch',
	method: 'post',

	async execute(req) {
		const { userid, body: { branch, newName } } = req;
		if (typeof newName !== 'string' || !/^[-_.a-zA-Z0-9]+$/.test(newName)) {
			throw new Error('Invalid branch name');
		}
		const timestamp = Math.floor(Date.now() / 1000);

		await this.context.gameMutex.scope(async() => {
			const user = User.read(await this.context.persistence.get(`user/${userid}/info`));
			// Validity checks
			if (user.code.branches.length > kMaxBranches) {
				throw new Error('Too many branches');
			} else if (user.code.branches.some(branch => branch.name === newName)) {
				throw new Error('Branch already exists');
			}
			const branchId = firstMatching(user.code.branches, info => info.name === branch)?.id;
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
				this.context.persistence.set(`user/${userid}/info`, User.write(user)),
				this.context.persistence.set(`user/${userid}/${newId}`,
					await this.context.persistence.get(`user/${userid}/${branchId}`)),
			]);
		});

		return { ok: 1, timestamp: timestamp * 1000 };
	},
};

const BranchSetEndpoint: Endpoint = {
	path: '/set-active-branch',
	method: 'post',

	async execute(req) {
		const { userid, body: { branch } } = req;
		await this.context.gameMutex.scope(async() => {
			const user = User.read(await this.context.persistence.get(`user/${userid}/info`));
			const { id, name } = getBranchIdFromQuery(branch, user);
			if (id === undefined) {
				throw new Error('Invalid branch');
			}
			user.code.branch = id;
			await this.context.persistence.set(`user/${userid}/info`, User.write(user));
			Channel.publish<RunnerUserMessage>(`user/${userid}/runner`, { type: 'push', id, name });
		});

		return { ok: 1 };
	},
};

const CodeEndpoint: Endpoint = {
	path: '/code',

	async execute(req) {
		const { userid, body: { branch } } = req;
		const user = User.read(await this.context.persistence.get(`user/${userid}/info`));
		const { id, name } = getBranchIdFromQuery(branch, user);
		if (id === undefined) {
			return { ok: 1, branch: name, modules: { main: '' } };
		}

		const code = Code.read(await this.context.persistence.get(`user/${userid}/${id}`));
		return { ok: 1, branch: name, modules: mapToKeys(code.modules) };
	},
};

const CodePostEndpoint: Endpoint = {
	path: '/code',
	method: 'post',

	async execute(req) {
		// Validate this code payload
		const { userid, body: { branch, modules } } = req;
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
		await this.context.gameMutex.scope(async() => {
			// Load user branch manifest
			const user = User.read(await this.context.persistence.get(`user/${userid}/info`));
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
				this.context.persistence.set(`user/${userid}/info`, User.write(user)),
				this.context.persistence.set(`user/${userid}/${id}`, Code.write({
					modules: new Map(Object.entries(modules)),
				})),
			]);
			Channel.publish<RunnerUserMessage>(`user/${userid}/runner`, { type: 'push', id, name });
		});
		return { ok: 1, timestamp: timestamp * 1000 };
	},
};

const ConsoleEndpoint: Endpoint = {
	path: '/console',
	method: 'post',

	execute(req) {
		const { userid, body: { expression } } = req;
		if (typeof expression !== 'string') {
			throw new TypeError('Invalid expression');
		}
		try {
			// Try to parse it
			new Function(expression);
			Channel.publish<RunnerUserMessage>(`user/${userid}/runner`, { type: 'eval', expr: req.body.expression });
		} catch (err) {
			Channel.publish<Code.ConsoleMessage>(
				`user/${userid}/console`,
				{ type: 'console', result: `💥${err.message}` });
		}
		return { ok: 1 };
	},
};

export default [ BranchesEndpoint, BranchCloneEndpoint, BranchSetEndpoint, BranchSetEndpoint, CodeEndpoint, CodePostEndpoint, ConsoleEndpoint ];
