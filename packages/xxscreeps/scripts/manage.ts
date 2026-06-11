// Ops tool for managing users on a self-hosted xxscreeps server — connects to the configured
// storage provider directly, like scripts/scrape-world.ts. Run after `tsc -b`:
// `node packages/xxscreeps/dist/scripts/manage.js user <verb> ...` (usage() lists commands).
//
// The running engine caches state: list/show/create read storage per request, but a new user isn't
// processed until it owns an object in a room. `remove` deletes records only — owned room objects
// are left alone — and is safe for inactive users; pause the engine first if the user is live.

import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as Code from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { primitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { deleteUserMemoryBlob, loadUserMemoryBlob } from 'xxscreeps/mods/memory/model.js';

using db = await Database.connect();
using shard = await Shard.connect(db, config.shards[0]!.name);

const out = (line: string) => process.stdout.write(`${line}\n`);
const save = () => Promise.all([ db.save(), shard.save() ]);

// Accepts either a raw user id or a username.
async function resolveUserId(who: string) {
	if (await db.data.sIsMember('users', who)) {
		return who;
	}
	const byName = await User.findUserByName(db, who);
	if (byName !== null) {
		return byName;
	}
	throw new Error(`No such user: ${who}`);
}

async function userList() {
	const ids = await db.data.sMembers('users');
	if (ids.length === 0) {
		out('(no users)');
		return;
	}
	const idWidth = Math.max(...Fn.map(ids, id => id.length));
	const rows = await Fn.mapAwait(ids.sort(primitiveComparator), async id => {
		const info = await db.data.hmGet(User.infoKey(id), [ 'username', 'branch' ]);
		return `${id.padEnd(idWidth)}  ${(info.username ?? '?').padEnd(20)}  ${info.branch ?? '(none)'}`;
	});
	out(`${'id'.padEnd(idWidth)}  ${'username'.padEnd(20)}  branch`);
	for (const row of rows) {
		out(row);
	}
}

async function userShow(who: string) {
	const id = await resolveUserId(who);
	const [ info, providers, branches, memory ] = await Promise.all([
		db.data.hGetAll(User.infoKey(id)),
		User.findProvidersForUser(db, id),
		db.data.sMembers(Code.branchManifestKey(id)),
		loadUserMemoryBlob(shard, id),
	]);
	const providerList = Object.entries(providers).map(([ provider, value ]) => `${provider}=${value}`);
	out(`id            ${id}`);
	out(`username      ${info.username ?? '?'}`);
	out(`active branch ${info.branch ?? '(none)'}`);
	if (info.registeredDate !== undefined) {
		out(`registered    ${new Date(Number(info.registeredDate)).toISOString()}`);
	}
	out(`badge         ${info.badge === undefined ? 'none' : 'set'}`);
	out(`providers     ${providerList.length > 0 ? providerList.join(', ') : '(none)'}`);
	out(`code branches ${branches.length > 0 ? branches.join(', ') : '(none)'}`);
	out(`memory        ${memory === null ? 'none' : `${memory.length} bytes`}`);
}

async function userCreate(name: string, email?: string) {
	if (!User.checkUsername(name)) {
		throw new Error(`Invalid username: ${name}`);
	}
	const id = Id.generateId(12);
	await User.create(db, id, name, email === undefined ? [] : [ { provider: 'email', id: email } ]);
	await save();
	out(`Created user ${name} (${id}).`);
}

async function userRemove(who: string) {
	const id = await resolveUserId(who);
	await Promise.all([
		User.remove(db, id),
		deleteUserMemoryBlob(shard, id),
	]);
	await save();
	out(`Removed user ${who} (${id}).`);
}

function usage(): never {
	process.stderr.write(`Usage:
  user list
  user show   <name|id>
  user create <name> [email]
  user remove <name|id>
`);
	process.exit(2);
}

const [ noun, verb, ...rest ] = process.argv.slice(2);
try {
	switch (`${noun} ${verb}`) {
		case 'user list': await userList(); break;
		case 'user show': if (rest[0] === undefined) usage(); await userShow(rest[0]); break;
		case 'user create': if (rest[0] === undefined) usage(); await userCreate(rest[0], rest[1]); break;
		case 'user remove': if (rest[0] === undefined) usage(); await userRemove(rest[0]); break;
		default: usage();
	}
} catch (err) {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
	process.exitCode = 1;
}
