import type { Database } from 'xxscreeps/engine/db/index.js';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { infoKey } from 'xxscreeps/engine/db/user/index.js';

const pbkdf2 = promisify(crypto.pbkdf2);

// PBKDF2-SHA512, 100k iterations, 16-byte salt, 64-byte derived key. Stored as
// a JSON blob on the `password` field of the user info hash; the schema is
// pinned here so that both backend auth routes and the CLI `auth.setPassword`
// command share one writer and one reader.
const iterations = 100000;

// `hash` is a Node Buffer; JSON.stringify calls its toJSON() which emits
// `{ type: 'Buffer', data: number[] }`, and Buffer.from understands that
// object shape on readback (ignoring the encoding arg). Preserving this
// serialization keeps passwords written by pre-refactor backends readable.
type StoredPassword = {
	hash: { type: 'Buffer'; data: number[] };
	iterations: number;
	salt: string;
};

export async function setPassword(db: Database, userId: string, password: string) {
	const salt = crypto.randomBytes(16);
	const hash = await pbkdf2(password, salt, iterations, 64, 'sha512');
	await db.data.hset(infoKey(userId), 'password', JSON.stringify({
		hash,
		iterations,
		salt: salt.toString('latin1'),
	}));
}

export async function checkPassword(db: Database, userId: string, password: string) {
	const payload = await db.data.hget(infoKey(userId), 'password');
	if (payload === null) return false;
	let info: StoredPassword | undefined;
	try {
		info = JSON.parse(payload) as StoredPassword;
	} catch {}
	if (info) {
		const hash = await pbkdf2(password, Buffer.from(info.salt, 'latin1'), info.iterations, 64, 'sha512');
		return hash.compare(Buffer.from(info.hash.data)) === 0;
	}
	return false;
}
