import * as fs from 'node:fs/promises';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { exportPayload } from 'xxscreeps/scripts/payload.js';

const file = process.argv[2];
if (!file?.endsWith('.json')) {
	throw new Error('Destination must be .json file');
}

await using db = await Database.connect();
await using shard = await Shard.connect(db, 'shard0');
await fs.writeFile(file, JSON.stringify(await exportPayload(shard), null, 1));
