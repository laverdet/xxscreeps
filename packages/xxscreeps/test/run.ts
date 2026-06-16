import { flush, summary } from './context.js';
import './import.js';
import 'xxscreeps:mods/driver';

await import('xxscreeps/engine/db/storage/local/test.js');
await import('xxscreeps/engine/db/user/test.js');
await import('xxscreeps/game/test.js');
await import('xxscreeps:mods/test');
await import('xxscreeps/cli/test.js');
try {
	await flush();
} catch (err) {
	console.log(err);
	process.exitCode = 1;
}
summary();
// Force exit — test modules hold db/shard connections that keep the event loop alive
process.exit();
