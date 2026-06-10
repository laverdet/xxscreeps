import type { JSONSchemaType } from 'ajv';
import type { Database } from 'xxscreeps/engine/db/index.js';
import { hooks, makeValidatedPayloadRoute, makeValidatedQueryRoute } from 'xxscreeps/backend/index.js';
import * as Code from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getConsoleChannel, requestRunnerEval } from 'xxscreeps/engine/runner/model.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { typedArrayToString } from 'xxscreeps/utility/string.js';

const kCodeSizeLimit = 5 * 1024 * 1024;
const kDefaultBranch = 'main';
const kMaxBranches = 30;

function checkBranchName(branchName: string): asserts branchName is string {
	if (typeof branchName !== 'string' || branchName.length > 30) {
		throw new Error('Invalid branch name');
	}
}

async function getBranchNameFromQuery(db: Database, userId: string, branchName: string) {
	if (!branchName || branchName === '$activeWorld') {
		return await db.data.hGet(User.infoKey(userId), 'branch') ?? kDefaultBranch;
	}
	checkBranchName(branchName);
	return branchName;
}

function getModulePayloadFromQuery(query: object | null | undefined) {
	if (!query) {
		return new Map([ [ 'main', '' ] ]);
	}
	const entries = Fn.map(Object.entries(query), ([ name, content ]): [ string, any ] => {
		const decoded = function() {
			if (content === null) {
				return;
			} else if (typeof content === 'string') {
				return content;
			} else if (
				typeof content === 'object' && typeof content.binary === 'string') {
				return Buffer.from(content.binary, 'base64');
			}
			throw new TypeError('Invalid payload');
		}();
		return [ name, decoded ];
	});
	const modules = new Map(Fn.reject(entries, entry => entry[1] === undefined));
	if (![ 'main', 'main.js', 'main.mjs', 'main.wasm' ].some(entry => modules.has(entry))) {
		modules.set('main', '');
	}
	const size = Fn.pipe(
		modules.values(),
		$$ => Fn.map($$, content => {
			if (typeof content === 'string') {
				return content.length;
			} else {
				// Vanilla Screeps stores these in base64, so add fake encoding overhead to match
				return content.byteLength * 1.333;
			}
		}),
		$$ => Fn.accumulate($$));
	if (size > kCodeSizeLimit) {
		throw new Error('Too much code');
	}
	return modules;
}

function toModulesContent(payload: Code.CodePayload) {
	return Object.fromEntries(Fn.map(
		payload.entries(),
		([ name, content ]) =>
			[ name, typeof content === 'string' ? content : {
				binary: btoa(typedArrayToString(content)),
			} ]));
}

hooks.register('route', {
	path: '/api/user/branches',

	async execute(context) {
		const { userId } = context.state;
		const branches = userId == null ? undefined : await context.db.data.sMembers(Code.branchManifestKey(userId));

		if (userId == null || !branches || branches.length === 0) {
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
		const currentBranch = await context.shard.data.hGet(User.infoKey(userId), 'branch');
		const withCode = Boolean(context.request.query.withCode);
		return {
			ok: 1,
			list: await Promise.all(Fn.map(branches, async branchName => ({
				activeWorld: branchName === currentBranch,
				branch: branchName,
				...withCode && {
					// What is this endpoint for??
					// 5mb branches * 30 count = 150mb response payload??
					modules: toModulesContent((await Code.loadContent(context.db, userId, branchName))!),
				},
			}))),
		};
	},
});

interface CloneBranchRequest {
	branch?: string | null;
	defaultModules?: object | null;
	newName: string;
}

const cloneBranchRequestSchema: JSONSchemaType<CloneBranchRequest> = {
	type: 'object',
	properties: {
		branch: { type: 'string', nullable: true },
		newName: { type: 'string' },
		defaultModules: { type: 'object', nullable: true },
	},
	required: [ 'newName' ],
};

hooks.register('route', {
	path: '/api/user/clone-branch',
	method: 'post',

	execute: makeValidatedPayloadRoute(cloneBranchRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}

		// Check request
		const branch = await async function() {
			const { branch } = context.request.body;
			return branch && getBranchNameFromQuery(context.db, userId, branch);
		}();
		const { newName } = context.request.body;
		checkBranchName(newName);
		const key = Code.branchManifestKey(userId);
		const branches = await context.db.data.sMembers(key);
		if (branches.length >= kMaxBranches) {
			throw new Error('Too many branches');
		} else if (branches.includes(newName)) {
			throw new Error('Branch already exists');
		} else if (branch && !branches.includes(branch)) {
			return;
		}

		// Create the branch
		const timestamp = Date.now();
		const updated = await async function() {
			if (branch) {
				const [ updatedBlobs, updatedStrings ] = await Promise.all([
					context.db.data.copy(Code.buffersKey(userId, branch), Code.buffersKey(userId, newName)),
					context.db.data.copy(Code.stringsKey(userId, branch), Code.stringsKey(userId, newName)),
				]);
				await Promise.all([
					updatedBlobs ? undefined : context.db.data.vdel(Code.buffersKey(userId, newName)),
					updatedStrings ? undefined : context.db.data.vdel(Code.stringsKey(userId, newName)),
				]);
				return updatedBlobs || updatedStrings;
			} else {
				const modules = getModulePayloadFromQuery(context.request.body.defaultModules);
				await Code.saveContent(context.db, userId, newName, modules);
				return true;
			}
		}();
		if (!updated) {
			throw new Error('Failed to copy');
		}
		await context.db.data.sAdd(Code.branchManifestKey(userId), [ newName ]);

		return { ok: 1, timestamp };
	}),
});

interface DeleteBranchRequest {
	branch: string;
}

const deleteBranchRequestSchema: JSONSchemaType<DeleteBranchRequest> = {
	type: 'object',
	properties: {
		branch: { type: 'string' },
	},
	required: [ 'branch' ],
};

hooks.register('route', {
	path: '/api/user/delete-branch',
	method: 'post',

	execute: makeValidatedPayloadRoute(deleteBranchRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const [ branch, currentBranch ] = await Promise.all([
			getBranchNameFromQuery(context.db, userId, context.request.body.branch),
			context.shard.data.hGet(User.infoKey(userId), 'branch'),
		]);
		if (branch === currentBranch) {
			return;
		}
		await Promise.all([
			context.db.data.sRem(Code.branchManifestKey(userId), [ branch ]),
			context.db.data.vdel(Code.buffersKey(userId, branch)),
			context.db.data.vdel(Code.stringsKey(userId, branch)),
		]);
		return { ok: 1 };
	}),
});

interface SetActiveBranchRequest {
	branch: string;
}

const setActiveBranchRequestSchema: JSONSchemaType<SetActiveBranchRequest> = {
	type: 'object',
	properties: {
		branch: { type: 'string' },
	},
	required: [ 'branch' ],
};

hooks.register('route', {
	path: '/api/user/set-active-branch',
	method: 'post',

	execute: makeValidatedPayloadRoute(setActiveBranchRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const branch = await getBranchNameFromQuery(context.db, userId, context.request.body.branch);
		if (!await context.db.data.sIsMember(Code.branchManifestKey(userId), branch)) {
			return;
		}
		await context.db.data.hSet(User.infoKey(userId), 'branch', branch);
		await Code.getUserCodeChannel(context.db, userId).publish({ type: 'switch', branch });
		return { ok: 1 };
	}),
});

interface GetCodeRequest {
	branch: string;
}

const getCodeRequestSchema: JSONSchemaType<GetCodeRequest> = {
	type: 'object',
	properties: {
		branch: { type: 'string' },
	},
	required: [ 'branch' ],
};

hooks.register('route', {
	path: '/api/user/code',

	execute: makeValidatedQueryRoute(getCodeRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return { ok: 1, branch: kDefaultBranch, modules: { main: '' } };
		}
		const branchName = await getBranchNameFromQuery(context.db, userId, context.request.query.branch);
		const payload = await Code.loadContent(context.db, userId, branchName);
		if (!payload) {
			if (branchName === kDefaultBranch) {
				return { ok: 1, branch: kDefaultBranch, modules: { main: '' } };
			} else {
				return;
			}
		}
		return { ok: 1, branch: branchName, modules: toModulesContent(payload) };
	}),
});

interface SaveCodeRequest {
	branch: string;
	modules: object;
}

const saveCodeRequestSchema: JSONSchemaType<SaveCodeRequest> = {
	type: 'object',
	properties: {
		branch: { type: 'string' },
		modules: { type: 'object' },
	},
	required: [ 'branch', 'modules' ],
};

hooks.register('route', {
	path: '/api/user/code',
	method: 'post',

	execute: makeValidatedPayloadRoute(saveCodeRequestSchema, async context => {
		// Validate this code payload
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const modules = getModulePayloadFromQuery(context.request.body.modules);

		// Save it
		const branchName = await getBranchNameFromQuery(context.db, userId, context.request.body.branch);
		await Code.saveContent(context.db, userId, branchName, modules);
		return { ok: 1 };
	}),
});

interface ConsoleRequest {
	expression: string;
}

const consoleRequestRequestSchema: JSONSchemaType<ConsoleRequest> = {
	type: 'object',
	properties: {
		expression: { type: 'string' },
	},
	required: [ 'expression' ],
};

hooks.register('route', {
	path: '/api/user/console',
	method: 'post',

	execute: makeValidatedPayloadRoute(consoleRequestRequestSchema, async context => {
		const { userId } = context.state;
		if (userId == null) {
			return;
		}
		const { expression } = context.request.body;
		try {
			// Try to parse it
			// eslint-disable-next-line no-new, @typescript-eslint/no-implied-eval, no-new-func
			new Function(expression);
			await requestRunnerEval(context.shard, userId, expression, true);
		} catch (err: any) {
			await getConsoleChannel(context.shard, userId).publish(JSON.stringify([ { fd: 2, data: err.message } ]));
		}
		return { ok: 1 };
	}),
});
