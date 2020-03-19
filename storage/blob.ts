import { promises as fs } from 'fs';
import * as Path from 'path';
import Config from '~/engine/config';

export class BlobStorage {
	private readonly knownPaths = new Set<string>();

	constructor(
		private readonly path: string,
	) {}

	static async connect(prefix: string) {
		const config = await Config;
		const dataPath = Path.join(Path.dirname(config.file), config.config.storage.path);
		const path = Path.join(dataPath, prefix);
		const dir = await fs.opendir(path);
		await dir.close();
		return new BlobStorage(path);
	}

	disconnect() {}

	async load(fragment: string): Promise<Readonly<Uint8Array>> {
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

	async save(fragment: string, blob: Uint8Array) {
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
	}
}
