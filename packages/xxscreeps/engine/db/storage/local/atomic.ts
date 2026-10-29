import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as Path from 'node:path';

/**
 * A staging path for an atomic write, unique to this process and this write. Concurrent writers of
 * the same key must not share one staging file: two writes into a single `.swp` followed by two
 * renames can install mixed bytes under the target name, and nothing detects that until the value
 * is read back.
 */
export function stagingPath(path: string) {
	const nonce = crypto.randomBytes(6).toString('hex');
	return Path.join(Path.dirname(path), `.${Path.basename(path)}.${process.pid}.${nonce}.swp`);
}

/**
 * Install `payload` at `path` atomically. The staged copy is verified before the rename, so a
 * damaged write is dropped and the previous snapshot is left in place instead of being replaced
 * with one that cannot be read back.
 */
export async function writeAtomic(
	path: string,
	payload: string | Uint8Array,
	verify: (copy: string | Uint8Array) => void,
) {
	const staged = stagingPath(path);
	await fs.writeFile(staged, payload);
	try {
		verify(typeof payload === 'string'
			? await fs.readFile(staged, 'utf8')
			: await fs.readFile(staged));
	} catch (err) {
		await fs.rm(staged, { force: true });
		throw err;
	}
	await fs.rename(staged, path);
}
