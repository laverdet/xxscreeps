import type * as P from 'xxscreeps/engine/db/storage/provider';
import type { Effect } from 'xxscreeps/utility/types';
import fsSync from 'fs';
import fs from 'fs/promises';
import Fn from 'xxscreeps/utility/functional';
import * as Path from 'path';
import { fileURLToPath } from 'url';
import { listen, spread } from 'xxscreeps/utility/async';

export class BlobStorage {
	private readonly cache = new Map<string, {
		saveId: number;
		value: Readonly<Uint8Array> | null;
	}>();

	private saveId = 0;
	private readonly knownPaths = new Set<string>();

	constructor(private readonly path: string | null) {}

	static async create(url: URL): Promise<[ Effect, BlobStorage ]> {
		if (url.protocol === 'file:') {
			const path = fileURLToPath(url);
			await BlobStorage.initializeDirectory(path);
			const host = new BlobStorage(path);
			const unlisten = () => listen(process, 'exit', () => host.checkMissingFlush());
			return [
				() => {
					unlisten();
					host.checkMissingFlush();
					fsSync.unlinkSync(Path.join(path, '.lock'));
				},
				host,
			];
		} else {
			return [ () => {}, new BlobStorage(null) ];
		}
	}

	private static async initializeDirectory(path: string) {
		// Ensure directory exists, or make it
		await fs.mkdir(path, { recursive: true });

		// Lock file maker
		const lockFile = Path.join(path, '.lock');
		const tryLock = async() => {
			const file = await fs.open(lockFile, 'wx');
			await file.write(`${process.pid}`);
			await file.close();
		};

		await (async() => {
			// Try lock
			try {
				await tryLock();
				return;
			} catch (err) {}

			// On failure get locked pid
			const pid = await async function() {
				try {
					return JSON.parse(await fs.readFile(lockFile, 'utf8'));
				} catch (err) {
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
					} catch (err) {
						return false;
					}
				}();
				if (exists) {
					throw new Error(`pid ${pid} has locked ${path}`);
				}
			}

			// The lock is dead and can be removed
			// nb: This unlink is definitely a race condition
			await fs.unlink(lockFile);

			// Try once more
			await tryLock();
		})();
	}

	async copy(from: string, to: string, options?: P.Copy) {
		this.check(to);
		const value = await this.get(from);
		if (options?.if === 'nx' && await this.get(to)) {
			return false;
		} else if (value === null) {
			return false;
		} else {
			this.cache.set(to, {
				saveId: this.saveId,
				value,
			});
			return true;
		}
	}

	async del(key: string) {
		this.check(key);
		// Check if the write is still pending
		const cached = this.cache.get(key);
		if (cached?.saveId === this.saveId) {
			this.cache.set(key, {
				saveId: -1,
				value: null,
			});
			return cached.value !== null;
		} else if (this.path === null) {
			return false;
		} else {
			// Ensure it actually exists on disk
			const path = Path.join(this.path, key);
			try {
				await fs.stat(path);
			} catch (err) {
				this.cache.set(key, {
					saveId: -1,
					value: null,
				});
				return false;
			}
			this.cache.set(key, {
				saveId: this.saveId,
				value: null,
			});
		}
		return true;
	}

	async get(key: string) {
		this.check(key);
		// Check in-memory buffer
		const cached = this.cache.get(key);
		if (cached) {
			return cached.value;
		} else if (this.path === null) {
			return null;
		}
		// Open handle from file system, we should catch this error
		const path = Path.join(this.path, key);
		const handle = await async function() {
			try {
				return await fs.open(path, 'r');
			} catch (err) {
				return null;
			}
		}();
		if (handle) {
			// An error here would be unexpected, so don't catch
			const { size } = await handle.stat();
			const value = new Uint8Array(new SharedArrayBuffer(size));
			if ((await handle.read(value, 0, size)).bytesRead !== size) {
				throw new Error('Read partial file');
			}
			await handle.close();
			this.cache.set(key, {
				saveId: -1,
				value,
			});
			return value;
		} else {
			// Cache the absence of this file
			this.cache.set(key, {
				saveId: -1,
				value: null,
			});
			return null;
		}
	}

	async req(key: string) {
		const value = await this.get(key);
		if (value === null) {
			throw new Error(`"${key}" does not exist`);
		}
		return value;
	}

	set(key: string, value: Readonly<Uint8Array>, options?: P.Set) {
		this.check(key);
		this.cache.set(key, {
			saveId: this.saveId,
			value: function() {
				if (value.buffer instanceof SharedArrayBuffer && !options?.retain) {
					return value;
				} else {
					const copy = new Uint8Array(new SharedArrayBuffer(value.length));
					copy.set(value);
					return copy;
				}
			}(),
		});
	}

	async flushdb() {
		this.cache.clear();
		this.knownPaths.clear();
		if (this.path !== null) {
			await fs.rm(this.path, { recursive: true });
			await BlobStorage.initializeDirectory(this.path);
		}
	}

	async save() {
		// Get changes since last save
		if (this.path === null) {
			return;
		}
		const entries = [ ...Fn.filter(this.cache, entry => entry[1].saveId === this.saveId) ];
		++this.saveId;

		// Save to disk
		await spread(500, entries, async([ key, { value } ]) => {
			const path = Path.join(this.path!, key);
			const dirname = Path.dirname(path);
			if (value) {
				if (!this.knownPaths.has(dirname)) {
					try {
						await fs.mkdir(dirname, { recursive: true });
					} catch (err: any) {
						if (err.code !== 'EEXIST') {
							throw err;
						}
					}
					this.knownPaths.add(dirname);
				}
				const tmp = Path.join(this.path!, Path.dirname(key), `.${Path.basename(key)}.swp`);
				await fs.writeFile(tmp, value);
				await fs.rename(tmp, path);
			} else {
				await fs.unlink(path);
			}
		});

		// Also remove empty directories after everything has flushed
		const unlinkedDirectories = new Set<string>();
		await Promise.all(Fn.map(entries, async([ key, { value } ]) => {
			if (value) {
				return;
			}
			const path = Path.join(this.path!, key);
			for (let dir = Path.dirname(path); dir !== this.path; dir = Path.dirname(dir)) {
				if (unlinkedDirectories.has(dir)) {
					break;
				}
				try {
					unlinkedDirectories.add(dir);
					await fs.rmdir(dir);
					this.knownPaths.delete(dir);
				} catch (err) {
					break;
				}
			}
		}));
	}

	private check(fragment: string) {
		// Safety check before writing random file names based on user input
		if (!/^[a-zA-Z0-9/_-]*[a-zA-Z0-9_-]+$/.test(fragment)) {
			throw new Error(`Unsafe blob id: ${fragment}`);
		}
	}

	private checkMissingFlush() {
		const size = Fn.accumulate(this.cache, entry => entry[1].saveId === this.saveId ? 1 : 0);
		if (size !== 0) {
			console.warn(`Blob storage shut down with ${size} pending write(s)`);
		}
	}
}
