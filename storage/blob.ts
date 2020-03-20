import { promises as fs } from 'fs';
import * as Path from 'path';
import * as Iterables from '~/lib/iterable';
import Config from '~/engine/config';
import { Responder } from './responder';

function copy(buffer: Readonly<Uint8Array>) {
	const copy = new Uint8Array(new SharedArrayBuffer(buffer.length));
	copy.set(buffer);
	return copy;
}

export abstract class BlobStorage {
	abstract load(fragment: string): Promise<Readonly<Uint8Array>>;
	abstract save(fragment: string, blob: Uint8Array): Promise<void>;

	static async connect() {
		return Responder.connect<BlobStorageHost, BlobStorageClient>('blobStorage', BlobStorageClient);
	}

	static async create() {
		return Responder.create('blobStorage', async() => {
			const config = await Config;
			const path = Path.join(Path.dirname(config.file), config.config.storage.path);
			const dir = await fs.opendir(path);
			await dir.close();
			return new BlobStorageHost(path);
		});
	}

	request(method: string, payload?: any): any {
		if (method === 'load') {
			return this.load(payload);
		} else if (method === 'save') {
			return this.save(payload.fragment, payload.blob);
		} else {
			return Promise.reject(new Error(`Unknown method: ${method}`));
		}
	}
}

class BlobStorageHost extends BlobStorage {
	private bufferedBlobs = new Map<string, Readonly<Uint8Array>>();
	private bufferedDeletes = new Set<string>();
	private readonly knownPaths = new Set<string>();

	constructor(private readonly path: string) {
		super();
	}

	async flush() {
		// Reset buffers
		const blobs = this.bufferedBlobs;
		const deletes = this.bufferedDeletes;
		this.bufferedBlobs = new Map;
		this.bufferedDeletes = new Set;

		// Run saves and deletes in parallel
		await Promise.all([

			// Saves all buffered data to disk
			await Promise.all(Iterables.map(blobs.entries(), async([ fragment, blob ]) => {
				const path = Path.join(this.path, fragment);
				const dirname = Path.dirname(path);
				if (!this.knownPaths.has(dirname)) {
					try {
						await fs.mkdir(dirname, { recursive: true });
					} catch (err) {
						if (err.code !== 'EEXIST') {
							throw err;
						}
					}
					this.knownPaths.add(dirname);
				}
				await fs.writeFile(path, blob);
			})),

			// Dispatches buffered deletes
			await Promise.all(Iterables.map(deletes.values(), async fragment => {
				const path = Path.join(this.path, fragment);
				await fs.unlink(path);
			})),
		]);

		// Also remove empty directories after everything has flushed
		const unlinkedDirectories = new Set<string>();
		await Promise.all(Iterables.map(deletes.values(), async fragment => {
			const path = Path.join(this.path, fragment);
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

	async delete(fragment: string) {
		// If it hasn't been written to disk yet it will just be removed from the buffer
		if (this.bufferedBlobs.has(fragment)) {
			this.bufferedBlobs.delete(fragment);
		} else {
			this.bufferedDeletes.add(fragment);
		}
		return Promise.resolve();
	}

	async load(fragment: string): Promise<Readonly<Uint8Array>> {
		// Check in-memory buffer
		const buffered = this.bufferedBlobs.get(fragment);
		if (buffered !== undefined) {
			return buffered;
		}
		// Load from file system
		const path = Path.join(this.path, fragment);
		const handle = await fs.open(path, 'r');
		try {
			const { size } = await handle.stat();
			const buffer = new Uint8Array(new SharedArrayBuffer(size));
			if ((await handle.read(buffer, 0, size)).bytesRead !== size) {
				throw new Error('Read partial file');
			}
			return buffer;
		} finally {
			await handle.close();
		}
	}

	save(fragment: string, blob: Uint8Array) {
		this.bufferedBlobs.set(fragment, blob.buffer instanceof SharedArrayBuffer ? blob : copy(blob));
		return Promise.resolve();
	}
}

class BlobStorageClient extends BlobStorage {
	load(fragment: string): Promise<Readonly<Uint8Array>> {
		return this.request('load', fragment);
	}

	save(fragment: string, blob: Uint8Array) {
		return this.request('save', { fragment, blob: copy(blob) });
	}
}
