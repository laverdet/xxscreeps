import type { Database } from 'xxscreeps/engine/db/index.js';
import * as crypto from 'node:crypto';
import { promisify } from 'node:util';
import { infoKey } from 'xxscreeps/engine/db/user/index.js';

interface StoredPassword {
	hash: string;
	iterations: number;
	salt: string;
}

export async function checkPassword(db: Database, userId: string, password: string) {
	const info = await async function() {
		const payload = await db.data.hGet(infoKey(userId), 'password');
		try {
			return JSON.parse(payload!) as StoredPassword;
		} catch {}
	}();
	if (info) {
		const hash = await promisify(crypto.pbkdf2)(password, Buffer.from(info.salt, 'latin1'), info.iterations, 64, 'sha512');
		return hash.compare(Buffer.from(info.hash, 'latin1')) === 0;
	}
}

export async function setPassword(db: Database, userId: string, password: string) {
	const iterations = 100000;
	const salt = crypto.randomBytes(16);
	const hash = await promisify(crypto.pbkdf2)(password, salt, iterations, 64, 'sha512');
	await db.data.hSet(infoKey(userId), 'password', JSON.stringify({
		hash,
		iterations,
		salt: salt.toString('latin1'),
	}));
}
