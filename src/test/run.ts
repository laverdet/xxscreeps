import { importMods } from 'xxscreeps/config/mods/index.js';
import { flush } from './context.js';
import './import.js';
import './shard-race.js';

await importMods('test');
try {
	await flush();
} catch (err) {
	console.log(err);
}
