// Ops tool for managing users on a self-hosted xxscreeps server — connects to the configured
// storage provider directly, like scripts/scrape-world.ts. Run after `tsc -b`:
// `node packages/xxscreeps/dist/scripts/manage.js user <verb> ...` (usage() lists commands).
//
// The running engine caches state: list/show/create read storage per request, but a new user isn't
// processed until it owns an object in a room. `remove` deletes records only — owned room objects
// are left alone — and is safe for inactive users; pause the engine first if the user is live.

import * as fs from 'node:fs/promises';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import * as Badge from 'xxscreeps/engine/db/user/badge.js';
import * as Code from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { primitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { setPassword } from 'xxscreeps/mods/backend/password/model.js';
import { deleteUserMemoryBlob, loadUserMemoryBlob } from 'xxscreeps/mods/memory/model.js';

await using db = await Database.connect();
await using shard = await Shard.connect(db, config.shards[0]!.name);

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

// `source` is inline JSON or a path to a `.json` file holding a badge object (the same shape the
// `/api/user/badge` endpoint accepts). The standard 24 numbered badges are `{ color1, color2,
// color3, flip, param, type }`; see engine/db/user/badge.ts for the schema.
async function userBadge(who: string, source: string) {
	const id = await resolveUserId(who);
	const json = source.endsWith('.json') ? await fs.readFile(source, 'utf8') : source;
	const badge = Badge.validate(JSON.parse(json) as object);
	await Badge.save(db, id, JSON.stringify(badge));
	await save();
	out(`Set badge for ${who} (${id}).`);
}

// Operator password reset; there is no online path that sets a password without the old one. Only
// meaningful when the password backend mod is enabled. Mirrors its 8-character minimum.
async function userPassword(who: string, password: string) {
	if (password.length < 8) {
		throw new Error('Password must be at least 8 characters');
	}
	const id = await resolveUserId(who);
	await setPassword(db, id, password);
	await save();
	out(`Set password for ${who} (${id}).`);
}

// Switch the active code branch, mirroring `/api/user/set-active-branch`: persist then publish so a
// running runner reloads it next tick; a no-op publish on a stopped server.
async function userBranch(who: string, branch: string) {
	const id = await resolveUserId(who);
	if (!await db.data.sIsMember(Code.branchManifestKey(id), branch)) {
		const branches = await db.data.sMembers(Code.branchManifestKey(id));
		throw new Error(`No such branch: ${branch} (have: ${branches.length > 0 ? branches.join(', ') : 'none'})`);
	}
	await db.data.hSet(User.infoKey(id), 'branch', branch);
	await save();
	await Code.getUserCodeChannel(db, id).publish({ type: 'switch', branch });
	out(`Set active branch for ${who} (${id}) to '${branch}'.`);
}

function usage(): never {
	process.stderr.write(`Usage:
  user list
  user show     <name|id>
  user create   <name> [email]
  user remove   <name|id>
  user badge    <name|id> <json|file>
  user password <name|id> <password>
  user branch   <name|id> <branch>
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
		case 'user badge': if (rest[0] === undefined || rest[1] === undefined) usage(); await userBadge(rest[0], rest[1]); break;
		case 'user password': if (rest[0] === undefined || rest[1] === undefined) usage(); await userPassword(rest[0], rest[1]); break;
		case 'user branch': if (rest[0] === undefined || rest[1] === undefined) usage(); await userBranch(rest[0], rest[1]); break;
		default: usage();
	}
} catch (err) {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
	process.exitCode = 1;
}
