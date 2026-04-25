import { importMods } from 'xxscreeps/config/mods/index.js';
import { flush, summary } from './context.js';
import './import.js';
import 'xxscreeps/engine/db/storage/local/test.js';

await importMods('test');
try {
	await flush();
} catch (err) {
	console.log(err);
	process.exitCode = 1;
}
summary();
// Force exit — test modules hold db/shard connections that keep the event loop alive
process.exit();
