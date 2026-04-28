import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';

export class FileSystemLock implements Disposable {
	readonly url;

	constructor(url: URL) {
		this.url = url;
	}

	static async acquire(url: URL) {
		// Lock file maker
		const tryLock = async (): Promise<FileSystemLock> => {
			const file = await fs.open(url, 'wx');
			await file.write(`${process.pid}`);
			await file.close();
			return new FileSystemLock(url);
		};

		// Try lock
		try {
			return await tryLock();
		} catch {}

		// On failure get locked pid
		const pid = await async function() {
			try {
				return Number(await fs.readFile(url, 'utf8'));
			} catch {
			// Lock format unrecognized
			}
		}();

		// See if process still exists. On Docker the pid will probably always be the same, so just
		// ignore it in this case.
		if (pid !== undefined && pid !== process.pid) {
			const exists = function() {
				try {
					process.kill(pid, 0); // does *not* kill the process, just tries to send a signal
					return true;
				} catch {
					return false;
				}
			}();
			if (exists) {
				throw new Error(`pid ${pid} has locked ${url}`);
			}
		}

		// The lock is dead and can be removed
		// nb: This unlink is definitely a race condition
		await fs.unlink(url);
		return tryLock();
	}

	[Symbol.dispose]() {
		fsSync.unlinkSync(this.url);
	}

	async replace() {
		return fs.writeFile(this.url, `${process.pid}`, 'utf8');
	}
}
