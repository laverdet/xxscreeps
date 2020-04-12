import { promises as fs } from 'fs';
import * as Path from 'path';
import { listen, mapInPlace } from '~/lib/utility';
import config, { configPath } from '~/engine/config';
import { create, connect, Responder, ResponderClient, ResponderHost } from './responder';

const fragmentNameWhitelist = /^[a-zA-Z0-9/-]+$/;

function copy(buffer: Readonly<Uint8Array>) {
	const copy = new Uint8Array(new SharedArrayBuffer(buffer.length));
	copy.set(buffer);
	return copy;
}

export abstract class BlobStorage extends Responder {
	abstract delete(fragment: string): Promise<void>;
	abstract load(fragment: string): Promise<Readonly<Uint8Array>>;
	abstract save(fragment: string, blob: Readonly<Uint8Array>): Promise<void>;

	static connect() {
		return connect('blobStorage', BlobStorageClient, BlobStorageHost);
	}

	static async create() {
		const path = Path.join(Path.dirname(configPath), config.storage?.path ?? './data');
		const dir = await fs.opendir(path);
		await dir.close();
		return create('blobStorage', BlobStorageHost, path);
	}

	request(method: 'delete', fragment: string): Promise<void>;
	request(method: 'load', fragment: string): Promise<Readonly<Uint8Array>>;
	request(method: 'save', payload: { fragment: string; blob: Uint8Array }): Promise<void>;
	request(method: string, payload?: any) {
		if (method === 'delete') {
			return this.delete(payload);
		} else if (method === 'load') {
			return this.load(payload);
		} else if (method === 'save') {
			return this.save(payload.fragment, payload.blob);
		} else {
			return Promise.reject(new Error(`Unknown method: ${method}`));
		}
	}
}

const BlobStorageHost = ResponderHost(class BlobStorageHost extends BlobStorage {
	private bufferedBlobs = new Map<string, Readonly<Uint8Array>>();
	private bufferedDeletes = new Set<string>();
	private readonly knownPaths = new Set<string>();
	private readonly processUnlistener = listen(process, 'exit', () => this.checkMissingFlush());

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
			await Promise.all(mapInPlace(blobs.entries(), async([ fragment, blob ]) => {
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
			await Promise.all(mapInPlace(deletes.values(), async fragment => {
				const path = Path.join(this.path, fragment);
				await fs.unlink(path);
			})),
		]);

		// Also remove empty directories after everything has flushed
		const unlinkedDirectories = new Set<string>();
		await Promise.all(mapInPlace(deletes.values(), async fragment => {
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
		this.check(fragment);
		// If it hasn't been written to disk yet it will just be removed from the buffer
		if (this.bufferedBlobs.has(fragment)) {
			this.bufferedBlobs.delete(fragment);
		} else {
			this.bufferedDeletes.add(fragment);
		}
		return Promise.resolve();
	}

	disconnect() {
		this.processUnlistener();
		this.checkMissingFlush();
	}

	async load(fragment: string): Promise<Readonly<Uint8Array>> {
		this.check(fragment);
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

	save(fragment: string, blob: Readonly<Uint8Array>) {
		this.check(fragment);
		this.bufferedBlobs.set(fragment, blob.buffer instanceof SharedArrayBuffer ? blob : copy(blob));
		return Promise.resolve();
	}

	private check(fragment: string) {
		// Safety check before writing random file names based on user input
		if (!fragmentNameWhitelist.test(fragment)) {
			throw new Error(`Unsafe blob id: ${fragment}`);
		}
	}

	private checkMissingFlush() {
		const size = this.bufferedBlobs.size + this.bufferedDeletes.size;
		if (size !== 0) {
			console.warn(`Blob storage shut down with ${size} pending write(s)`);
		}
	}
});

const BlobStorageClient = ResponderClient(class BlobStorageClient extends BlobStorage {
	delete(fragment: string) {
		return this.request('delete', fragment);
	}

	load(fragment: string) {
		return this.request('load', fragment);
	}

	save(fragment: string, blob: Readonly<Uint8Array>) {
		return this.request('save', { fragment, blob: copy(blob) });
	}
});
