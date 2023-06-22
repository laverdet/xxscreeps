import { importMods } from 'xxscreeps/config/mods/index.js';
import { flush } from './context.js';
import './import.js';
await importMods('test');
try {
	await flush();
} catch (err) {
	console.log(err);
}
