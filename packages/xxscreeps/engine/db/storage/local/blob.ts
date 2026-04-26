import type * as Storage from 'xxscreeps/engine/db/storage/provider.js';
import type { Effect } from 'xxscreeps/utility/types.js';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Fn } from 'xxscreeps/functional/fn.js';
import { listen, spread } from 'xxscreeps/utility/async.js';
import { FileSystemLock } from 'xxscreeps/utility/file-lock.js';

export class BlobStorage {
	private readonly cache = new Map<string, {
		saveId: number;
		value: Readonly<Uint8Array> | null;
	}>();

	private saveId = 0;
	private readonly lock;
	private readonly knownPaths = new Set<string>();
	private readonly path;

	constructor(path: string | null, lock: FileSystemLock | undefined) {
		this.path = path;
		this.lock = lock;
	}

	static async create(url: URL): Promise<[ Effect, BlobStorage ]> {
		if (url.protocol === 'file:') {
			// Ensure directory exists
			assert.ok(url.pathname.endsWith('/'));
			const path = fileURLToPath(url);
			await fs.mkdir(path, { recursive: true });

			// Acquire lock
			const disposable = new DisposableStack();
			const lock = disposable.use(await FileSystemLock.acquire(new URL('.lock', url)));

			// Watch for missing `save`
			disposable.defer(listen(process, 'exit', () => host.checkMissingFlush()));
			disposable.defer(() => host.checkMissingFlush());

			// Return effect & blob provider
			const host = new BlobStorage(path, lock);
			return [ () => disposable.dispose(), host ];
		} else {
			return [ () => {}, new BlobStorage(null, undefined) ];
		}
	}

	async copy(from: string, to: string, options?: Storage.Copy) {
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
			} catch {
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
			} catch {
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

	set(key: string, value: Readonly<Uint8Array>, options?: Storage.Set) {
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
			await fs.mkdir(this.path);
			await this.lock?.replace();
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
		await spread(500, entries, async ([ key, { value } ]) => {
			const path = Path.join(this.path!, key);
			const dirname = Path.dirname(path);
			if (value) {
				if (!this.knownPaths.has(dirname)) {
					try {
						await fs.mkdir(dirname, { recursive: true });
					} catch (err: unknown) {
						// @ts-expect-error
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
		await Promise.all(Fn.map(entries, async ([ key, { value } ]) => {
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
				} catch {
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
